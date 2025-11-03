var BotPlayer = Player.extend({
	classId: 'BotPlayer',

	init: function (botId) {
		// Вызываем конструктор родительского класса
		Player.prototype.init.call(this, botId);
		
		// Флаг что это бот
		this._isBot = true;
		
		// ПРОСТАЯ ЛОГИКА: Просто счетчик кадров для задержки старта
		this._botTickCounter = 0; // Счетчик тиков с момента создания/респавна
		this._botStartDelay = 180; // 180 тиков = ~3 секунды при 60fps
		this._botCanMove = false; // Разрешение на движение
		
		// AI состояние
		this._aiState = 'idle'; // idle, seekingOrb, carryingOrb, landing
		this._targetOrb = null;
		this._targetLandingPad = null;
		this._aiUpdateInterval = 6; // Обновление AI каждые 6 тиков (~100ms)
		this._aiTickCounter = 0;
		
		// Параметры AI (более осторожные значения)
		this._turnSpeed = 0.5;
		this._thrustAccuracy = 0.3;
		this._maxSpeed = 3.0;
		this._safeAltitude = 50;
		
		// Для стабильной посадки
		this._landingAttempts = 0;
		this._maxLandingAttempts = 300;
		
		// Система планирования пути
		this._currentWaypoint = null; // Текущая точка пути
		this._needSafeAltitude = false; // Флаг необходимости набора высоты
	},

	tick: function (ctx) {
		// КРИТИЧНО: AI логика ПЕРЕД родительским tick
		// Иначе родитель может выйти раньше и наш код не выполнится
		
		if (ige.isServer && !this._crashed) {
			// Увеличиваем счетчик тиков
			this._botTickCounter++;
			
			// Проверяем, можно ли боту начать двигаться
			if (!this._botCanMove) {
				if (this._botTickCounter >= this._botStartDelay) {
					this._botCanMove = true;
				} else {
					// Пока не можем двигаться - держим все выключенным
					this.controls.left = false;
					this.controls.right = false;
					this.controls.thrust = false;
					this.controls.drop = false;
				}
			} else {
				// Можем двигаться - обновляем AI не каждый кадр
				this._aiTickCounter++;
				if (this._aiTickCounter >= this._aiUpdateInterval) {
					this._aiTickCounter = 0;
					this.updateAI();
				}
			}
		}
		
		// Вызываем родительский tick для физики ПОСЛЕ нашей логики
		Player.prototype.tick.call(this, ctx);
	},

	updateAI: function () {
		// Машина состояний AI
		switch (this._aiState) {
			case 'idle':
				this.aiIdle();
				break;
			case 'seekingOrb':
				this.aiSeekOrb();
				break;
			case 'carryingOrb':
				this.aiCarryOrb();
				break;
			case 'landing':
				this.aiLanding();
				break;
		}
	},

	// Состояние: ждем, ищем орб
	aiIdle: function () {
		// Ищем ближайший орб
		var orb = this.findNearestOrb();
		
		if (orb) {
			this._targetOrb = orb;
			this._aiState = 'seekingOrb';
			this._needSafeAltitude = true; // Флаг что нужно набрать безопасную высоту
		}
	},

	// Состояние: летим к орбу
	aiSeekOrb: function () {
		// Проверяем что орб еще существует
		if (!this._targetOrb || !this._targetOrb._translate) {
			this._targetOrb = null;
			this._aiState = 'idle';
			return;
		}
		
		// Если подобрали орб, переходим к следующему состоянию
		if (this._carryingOrb && this._orb === this._targetOrb) {
			this._aiState = 'carryingOrb';
			this._targetLandingPad = this.findNearestLandingPad();
			this._needSafeAltitude = true; // Снова нужна безопасная высота для полета с орбом
			this._currentWaypoint = null;
			return;
		}
		
		var orbX = this._targetOrb._translate.x;
		var orbY = this._targetOrb._translate.y;
		var myX = this._translate.x;
		var myY = this._translate.y;
		var currentAltitude = this.getCurrentAltitude();
		
		// КРИТИЧНО: Сначала набираем безопасную высоту после взлета
		var SAFE_FLIGHT_ALTITUDE = 120; // Безопасная высота для полета
		
		if (this._needSafeAltitude) {
			if (currentAltitude < SAFE_FLIGHT_ALTITUDE) {
				// ИСПРАВЛЕНО: Летим к фиксированной высоте над землей
				var terrainHeight = ige.server.getTerrainHeightAtX ? ige.server.getTerrainHeightAtX(myX) : 400;
				var targetY = terrainHeight - SAFE_FLIGHT_ALTITUDE; // Фиксированная точка
				
				// Взлетаем вертикально вверх до безопасной высоты
				this.flyTowards(myX, targetY, false);
				
				// ОТЛАДКА
				if (!this._lastClimbLog || ige._currentTime - this._lastClimbLog > 2000) {
					console.log('[BOT] Набор высоты:', {
						currentAlt: Math.round(currentAltitude),
						targetAlt: SAFE_FLIGHT_ALTITUDE,
						terrainHeight: Math.round(terrainHeight),
						targetY: Math.round(targetY)
					});
					this._lastClimbLog = ige._currentTime;
				}
				return;
			} else {
				// Достигли безопасной высоты - теперь планируем маршрут
				console.log('[BOT] ✓ Безопасная высота достигнута, начинаем полет к орбу');
				this._needSafeAltitude = false;
				this._currentWaypoint = null; // Сброс waypoint для нового планирования
			}
		}
		
		// Получаем скорость
		var velocity = this._box2dBody.GetLinearVelocity();
		var currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
		
		// Расстояние до орба
		var distX = orbX - myX;
		var distY = orbY - myY;
		var distToOrb = Math.sqrt(distX * distX + distY * distY);
		
		// СИСТЕМА ПЛАНИРОВАНИЯ ТРАЕКТОРИИ с учетом рельефа
		
		// Если нет текущей точки пути или она устарела, планируем новую
		if (!this._currentWaypoint || this.hasReachedWaypoint(this._currentWaypoint)) {
			this._currentWaypoint = this.planNextWaypoint(orbX, orbY);
			
			// ОТЛАДКА: Логируем планирование пути (раз в 3 секунды)
			if (!this._lastPathLog || ige._currentTime - this._lastPathLog > 3000) {
				console.log('[BOT] Waypoint к орбу:', {
					type: this._currentWaypoint.type,
					target: {x: Math.round(this._currentWaypoint.x), y: Math.round(this._currentWaypoint.y)},
					myPos: {x: Math.round(myX), y: Math.round(myY)},
					orbPos: {x: Math.round(orbX), y: Math.round(orbY)},
					altitude: Math.round(currentAltitude)
				});
				this._lastPathLog = ige._currentTime;
			}
		}
		
		// Динамическая проверка безопасности пути
		var pathIsSafe = this.checkPathSafety(this._currentWaypoint.x, this._currentWaypoint.y);
		
		if (!pathIsSafe) {
			// Путь опасен - корректируем высоту
			this._currentWaypoint = {
				x: myX,
				y: myY - 80,
				type: 'emergency_climb'
			};
		}
		
		// Летим к текущей точке пути
		var waypointDist = Math.sqrt(
			Math.pow(this._currentWaypoint.x - myX, 2) + 
			Math.pow(this._currentWaypoint.y - myY, 2)
		);
		
		// Определяем нужно ли тормозить
		var shouldSlowDown = false;
		if (this._currentWaypoint.type === 'final_approach') {
			shouldSlowDown = waypointDist < 80 || currentSpeed > 1.2;
		} else {
			shouldSlowDown = waypointDist < 150;
		}
		
		// Летим к waypoint
		if (this._currentWaypoint.type === 'final_approach' && waypointDist < 50) {
			this.approachSlowly(this._currentWaypoint.x, this._currentWaypoint.y);
		} else {
			this.flyTowards(this._currentWaypoint.x, this._currentWaypoint.y, shouldSlowDown);
		}
	},

	// Состояние: несем орб к платформе
	aiCarryOrb: function () {
		// Проверяем что платформа существует
		if (!this._targetLandingPad) {
			this._targetLandingPad = this.findNearestLandingPad();
		}
		
		// Если потеряли орб, возвращаемся к поиску
		if (!this._carryingOrb) {
			this._targetOrb = null;
			this._aiState = 'idle';
			this._currentWaypoint = null;
			return;
		}
		
		if (!this._targetLandingPad) {
			this._aiState = 'idle';
			return;
		}
		
		var padX = this._targetLandingPad[0];
		var padY = this._targetLandingPad[1];
		var myX = this._translate.x;
		var myY = this._translate.y;
		var currentAltitude = this.getCurrentAltitude();
		
		// КРИТИЧНО: Сначала набираем безопасную высоту с орбом
		var SAFE_FLIGHT_ALTITUDE = 120;
		
		if (this._needSafeAltitude) {
			if (currentAltitude < SAFE_FLIGHT_ALTITUDE) {
				// ИСПРАВЛЕНО: Летим к фиксированной высоте над землей
				var terrainHeight = ige.server.getTerrainHeightAtX ? ige.server.getTerrainHeightAtX(myX) : 400;
				var targetY = terrainHeight - SAFE_FLIGHT_ALTITUDE; // Фиксированная точка
				
				// Взлетаем вертикально вверх до безопасной высоты
				this.flyTowards(myX, targetY, false);
				
				// ОТЛАДКА
				if (!this._lastClimbLog || ige._currentTime - this._lastClimbLog > 2000) {
					console.log('[BOT] Набор высоты с орбом:', {
						currentAlt: Math.round(currentAltitude),
						targetAlt: SAFE_FLIGHT_ALTITUDE
					});
					this._lastClimbLog = ige._currentTime;
				}
				return;
			} else {
				// Достигли безопасной высоты
				console.log('[BOT] ✓ Безопасная высота с орбом достигнута');
				this._needSafeAltitude = false;
				this._currentWaypoint = null; // Сброс для нового планирования
			}
		}
		
		// Получаем скорость
		var velocity = this._box2dBody.GetLinearVelocity();
		var currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
		
		// Расстояние до платформы
		var distX = padX - myX;
		var distY = padY - myY;
		var distToPad = Math.sqrt(distX * distX + distY * distY);
		
		// СИСТЕМА ПЛАНИРОВАНИЯ ТРАЕКТОРИИ к платформе
		
		// Если нет текущей точки пути или она устарела, планируем новую
		if (!this._currentWaypoint || this.hasReachedWaypoint(this._currentWaypoint)) {
			this._currentWaypoint = this.planNextWaypointToPad(padX, padY);
		}
		
		// Динамическая проверка безопасности пути
		var pathIsSafe = this.checkPathSafety(this._currentWaypoint.x, this._currentWaypoint.y);
		
		if (!pathIsSafe) {
			// Путь опасен - корректируем высоту
			this._currentWaypoint = {
				x: myX,
				y: myY - 80,
				type: 'emergency_climb'
			};
		}
		
		// Летим к текущей точке пути
		var waypointDist = Math.sqrt(
			Math.pow(this._currentWaypoint.x - myX, 2) + 
			Math.pow(this._currentWaypoint.y - myY, 2)
		);
		
		// Определяем нужно ли тормозить
		var shouldSlowDown = waypointDist < 200 || this._currentWaypoint.type === 'landing_approach';
		
		this.flyTowards(this._currentWaypoint.x, this._currentWaypoint.y, shouldSlowDown);
		
		// Если близко к платформе и скорость низкая, начинаем посадку
		if (this._currentWaypoint.type === 'landing_approach' && waypointDist < 80 && currentSpeed < 2.0) {
			this._aiState = 'landing';
			this._landingAttempts = 0;
			this._currentWaypoint = null;
		}
	},

	// Состояние: садимся на платформу
	aiLanding: function () {
		// Проверяем что мы на платформе
		if (this._landed) {
			// Успешная посадка! Возвращаемся к поиску орбов
			this._targetOrb = null;
			this._targetLandingPad = null;
			this._aiState = 'idle';
			this._landingAttempts = 0;
			return;
		}
		
		// Если потеряли орб, возвращаемся к поиску
		if (!this._carryingOrb) {
			this._targetOrb = null;
			this._aiState = 'idle';
			this._landingAttempts = 0;
			return;
		}
		
		if (!this._targetLandingPad) {
			this._aiState = 'idle';
			return;
		}
		
		// Плавная посадка
		var padX = this._targetLandingPad[0];
		var padY = this._targetLandingPad[1];
		
		var distX = padX - this._translate.x;
		var distY = padY - this._translate.y;
		
		// Получаем текущую скорость
		var velocity = this._box2dBody.GetLinearVelocity();
		var currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
		
		// Выравниваем корабль (угол к 0)
		var currentAngle = this._rotate.z;
		var wound = Math.round(currentAngle / (2 * Math.PI));
		currentAngle -= 2 * Math.PI * wound;
		
		// Поворачиваем к нулю (более аккуратно)
		if (Math.abs(currentAngle) > 0.08) {
			if (currentAngle > 0) {
				this.controls.left = true;
				this.controls.right = false;
			} else {
				this.controls.right = true;
				this.controls.left = false;
			}
		} else {
			this.controls.left = false;
			this.controls.right = false;
		}
		
		// Медленно опускаемся с контролем скорости
		
		// Если далеко по горизонтали, очень аккуратно подлетаем
		if (Math.abs(distX) > 15) {
			// Летим очень медленно по горизонтали
			var targetY = this._translate.y - 5; // Немного выше текущей позиции
			this.flyTowards(padX, targetY);
		} else {
			// Близко по горизонтали - контролируем вертикальное падение
			this.controls.left = false;
			this.controls.right = false;
			
			// КРИТИЧНО: Контроль вертикальной скорости для безопасной посадки
			var verticalSpeed = velocity.y;
			var targetVerticalSpeed = 0.8; // Целевая скорость падения (медленно)
			var maxVerticalSpeed = 1.5; // Максимальная безопасная скорость падения
			
			// Если падаем слишком быстро - ТОРМОЗИМ
			if (verticalSpeed > maxVerticalSpeed) {
				this.controls.thrust = true;
			}
			// Если падаем слишком медленно и еще высоко - отключаем газ
			else if (verticalSpeed < targetVerticalSpeed && distY > 20) {
				this.controls.thrust = false;
			}
			// Если близко к платформе - активно тормозим
			else if (distY < 30 && verticalSpeed > 0.3) {
				this.controls.thrust = true;
			}
			// Иначе - поддерживаем медленное падение
			else if (verticalSpeed > targetVerticalSpeed + 0.2) {
				this.controls.thrust = true;
			} else if (verticalSpeed < targetVerticalSpeed - 0.2) {
				this.controls.thrust = false;
			}
		}
		
		// Если попытки посадки превышены, сбрасываем и ищем новый орб
		this._landingAttempts++;
		if (this._landingAttempts > this._maxLandingAttempts * 100) {
			this._aiState = 'idle';
			this._landingAttempts = 0;
		}
	},

	// Полет к точке (улучшенный с контролем скорости и безопасности)
	flyTowards: function (targetX, targetY, shouldSlowDown) {
		var distX = targetX - this._translate.x;
		var distY = targetY - this._translate.y;
		var distance = Math.sqrt(distX * distX + distY * distY);
		
		// Получаем текущую скорость
		var velocity = this._box2dBody.GetLinearVelocity();
		var currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
		var verticalSpeed = velocity.y;
		
		// Получаем высоту над картой
		var altitudeAboveTerrain = this.getCurrentAltitude();
		
		// Если очень близко к цели, останавливаемся
		if (distance < 40) {
			this.controls.thrust = false;
			return;
		}
		
		// Угол к цели
		var targetAngle = Math.atan2(distY, distX) + Math.PI / 2;
		
		// Текущий угол корабля
		var currentAngle = this._rotate.z;
		
		// Нормализация углов
		var wound = Math.round(currentAngle / (2 * Math.PI));
		currentAngle -= 2 * Math.PI * wound;
		
		wound = Math.round(targetAngle / (2 * Math.PI));
		targetAngle -= 2 * Math.PI * wound;
		
		// Разница углов
		var angleDiff = targetAngle - currentAngle;
		
		// Нормализация разницы (-PI to PI)
		if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
		if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
		
		// Поворот (более плавный)
		if (Math.abs(angleDiff) > 0.15) {
			if (angleDiff > 0) {
				this.controls.right = true;
				this.controls.left = false;
			} else {
				this.controls.left = true;
				this.controls.right = false;
			}
		} else {
			this.controls.left = false;
			this.controls.right = false;
		}
		
		// БЕЗОПАСНОСТЬ: Проверка скорости и торможение
		var needsBraking = false;
		
		// 1. Тормозим если скорость слишком высокая
		if (currentSpeed > this._maxSpeed) {
			needsBraking = true;
		}
		
		// 2. Тормозим если близко к цели (УЛУЧШЕНО: учитываем флаг shouldSlowDown)
		var brakingDistance = shouldSlowDown ? currentSpeed * 40 : currentSpeed * 30;
		if (distance < brakingDistance) {
			needsBraking = true;
		}
		
		// 3. Тормозим если слишком близко к карте
		if (altitudeAboveTerrain < this._safeAltitude && verticalSpeed > 0.5) {
			needsBraking = true;
		}
		
		// Применяем торможение или газ
		if (needsBraking) {
			// Поворачиваемся в противоположную сторону движения и даем газ (торможение)
			var velocityAngle = Math.atan2(velocity.y, velocity.x) + Math.PI / 2;
			var brakeAngle = velocityAngle + Math.PI; // Противоположное направление
			
			// Нормализация
			wound = Math.round(brakeAngle / (2 * Math.PI));
			brakeAngle -= 2 * Math.PI * wound;
			
			var brakeAngleDiff = brakeAngle - currentAngle;
			if (brakeAngleDiff > Math.PI) brakeAngleDiff -= 2 * Math.PI;
			if (brakeAngleDiff < -Math.PI) brakeAngleDiff += 2 * Math.PI;
			
			// Если смотрим против движения, тормозим
			if (Math.abs(brakeAngleDiff) < 0.5 && currentSpeed > 0.5) {
				this.controls.thrust = true;
			} else {
				this.controls.thrust = false;
			}
		} else {
			// Нормальный полет - газ если смотрим в правильную сторону
			
			// КРИТИЧНО: Если скорость близка к 0 (стартуем с платформы), включаем газ ВСЕГДА для взлета
			if (currentSpeed < 0.5) {
				// Взлет с платформы - просто включаем газ и поворачиваемся
				this.controls.thrust = true;
			} 
			// УЛУЧШЕНО: Компенсация гравитации - даем газ если падаем слишком быстро
			else if (verticalSpeed > 1.5) {
				// Падаем быстро - даем газ для компенсации гравитации
				this.controls.thrust = true;
			}
			// Режим торможения перед орбом - меньше газа
			else if (shouldSlowDown && currentSpeed > 1.5) {
				// Тормозим - не даем газ если уже достаточно быстро
				this.controls.thrust = false;
			}
			// Обычный полет
			else if (Math.abs(angleDiff) < this._thrustAccuracy && this._fuel > 10) {
				// Только если смотрим в правильную сторону
				// Только если безопасно по высоте или летим вверх
				if (altitudeAboveTerrain > this._safeAltitude || distY < 0) {
					this.controls.thrust = true;
				} else {
					this.controls.thrust = false;
				}
			} else {
				this.controls.thrust = false;
			}
		}
	},

	// Очень медленный подход к цели (для стыковки с орбом)
	approachSlowly: function (targetX, targetY) {
		var distX = targetX - this._translate.x;
		var distY = targetY - this._translate.y;
		var distance = Math.sqrt(distX * distX + distY * distY);
		
		// Получаем текущую скорость
		var velocity = this._box2dBody.GetLinearVelocity();
		var currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
		var verticalSpeed = velocity.y;
		
		// ЦЕЛЬ: Скорость должна быть очень маленькой (меньше 0.5)
		var MAX_APPROACH_SPEED = 0.6;
		
		// Если скорость слишком большая - активно тормозим
		if (currentSpeed > MAX_APPROACH_SPEED) {
			// Поворачиваемся против движения и даем газ
			var velocityAngle = Math.atan2(velocity.y, velocity.x) + Math.PI / 2;
			var brakeAngle = velocityAngle + Math.PI;
			
			// Нормализация угла
			var wound = Math.round(brakeAngle / (2 * Math.PI));
			brakeAngle -= 2 * Math.PI * wound;
			
			var currentAngle = this._rotate.z;
			var brakeAngleDiff = brakeAngle - currentAngle;
			if (brakeAngleDiff > Math.PI) brakeAngleDiff -= 2 * Math.PI;
			if (brakeAngleDiff < -Math.PI) brakeAngleDiff += 2 * Math.PI;
			
			// Поворачиваемся для торможения
			if (brakeAngleDiff > 0.1) {
				this.controls.left = true;
				this.controls.right = false;
			} else if (brakeAngleDiff < -0.1) {
				this.controls.left = false;
				this.controls.right = true;
			} else {
				this.controls.left = false;
				this.controls.right = false;
				// Тормозим
				this.controls.thrust = true;
			}
		} else {
			// Скорость нормальная - очень осторожно двигаемся к цели
			var targetAngle = Math.atan2(distY, distX) + Math.PI / 2;
			var currentAngle = this._rotate.z;
			
			// Нормализация
			var wound = Math.round(targetAngle / (2 * Math.PI));
			targetAngle -= 2 * Math.PI * wound;
			
			var angleDiff = targetAngle - currentAngle;
			if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
			if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
			
			// Поворачиваемся
			if (angleDiff > 0.05) {
				this.controls.left = true;
				this.controls.right = false;
			} else if (angleDiff < -0.05) {
				this.controls.left = false;
				this.controls.right = true;
			} else {
				this.controls.left = false;
				this.controls.right = false;
			}
			
			// Даем газ ТОЛЬКО если:
			// - смотрим в правильную сторону
			// - не падаем слишком быстро вниз (компенсация гравитации)
			// - скорость меньше максимальной для подхода
			if (Math.abs(angleDiff) < 0.3 && currentSpeed < MAX_APPROACH_SPEED && this._fuel > 5) {
				this.controls.thrust = true;
			} else if (verticalSpeed > 1.0) {
				// Компенсация гравитации - падаем
				this.controls.thrust = true;
			} else {
				this.controls.thrust = false;
			}
		}
	},

	// Планирование следующей точки пути к орбу с учетом рельефа
	planNextWaypoint: function (targetX, targetY) {
		var myX = this._translate.x;
		var myY = this._translate.y;
		
		var distX = targetX - myX;
		var distY = targetY - myY;
		var distToTarget = Math.sqrt(distX * distX + distY * distY);
		
		// Если очень близко к орбу - финальный подход
		if (distToTarget < 100) {
			return {
				x: targetX,
				y: targetY - 10, // Подлетаем чуть выше орба
				type: 'final_approach'
			};
		}
		
		// Сканируем рельеф между нами и целью
		// maxTerrainHeight = максимальный Y = самая НИЗКАЯ точка между нами и целью
		var maxTerrainHeight = this.getMaxTerrainHeightBetween(myX, targetX);
		
		// ОТЛАДКА: Проверяем что получили валидное значение
		if (isNaN(maxTerrainHeight) || maxTerrainHeight < 0) {
			console.warn('[BOT] Invalid terrain height:', maxTerrainHeight);
			maxTerrainHeight = 400; // Среднее значение
		}
		
		// Безопасная высота = на 120px ВЫШЕ (меньше Y) самой низкой точки рельефа
		var safeAltitudeY = maxTerrainHeight - 120;
		
		// КРИТИЧНО: Проверяем что безопасная высота не слишком высоко
		// Если получается отрицательное Y или слишком высоко, ограничиваем
		if (safeAltitudeY < 50) {
			safeAltitudeY = 50; // Не выше 50px от верха экрана
		}
		
		// Определяем промежуточную точку
		var waypointX, waypointY;
		
		if (Math.abs(distX) > 200) {
			// Далеко - летим на безопасной высоте к промежуточной точке
			waypointX = myX + (distX > 0 ? 200 : -200); // Двигаемся порциями по 200px
			waypointY = safeAltitudeY;
			
			return {
				x: waypointX,
				y: waypointY,
				type: 'cruise'
			};
		} else {
			// Близко - летим к точке над орбом
			waypointX = targetX;
			waypointY = targetY - 80; // Точка над орбом
			
			// Но проверяем что не слишком низко
			if (waypointY > maxTerrainHeight - 60) {
				waypointY = maxTerrainHeight - 60;
			}
			
			return {
				x: waypointX,
				y: waypointY,
				type: 'approach'
			};
		}
	},
	
	// Планирование следующей точки пути к платформе с учетом рельефа
	planNextWaypointToPad: function (targetX, targetY) {
		var myX = this._translate.x;
		var myY = this._translate.y;
		
		var distX = targetX - myX;
		var distY = targetY - myY;
		var distToTarget = Math.sqrt(distX * distX + distY * distY);
		
		// Если близко к платформе - финальный подход для посадки
		if (distToTarget < 120) {
			return {
				x: targetX,
				y: targetY - 80, // Над платформой
				type: 'landing_approach'
			};
		}
		
		// Сканируем рельеф между нами и целью
		var maxTerrainHeight = this.getMaxTerrainHeightBetween(myX, targetX);
		
		// С орбом летим еще осторожнее - на 140px выше рельефа
		var safeAltitudeY = maxTerrainHeight - 140;
		
		// КРИТИЧНО: Проверяем что не слишком высоко
		if (safeAltitudeY < 50) {
			safeAltitudeY = 50;
		}
		
		// Определяем промежуточную точку
		var waypointX, waypointY;
		
		if (Math.abs(distX) > 250) {
			// Далеко - летим на безопасной высоте к промежуточной точке
			waypointX = myX + (distX > 0 ? 250 : -250); // Двигаемся порциями по 250px
			waypointY = safeAltitudeY;
			
			return {
				x: waypointX,
				y: waypointY,
				type: 'cruise_with_orb'
			};
		} else {
			// Ближе - летим к точке над платформой
			waypointX = targetX;
			waypointY = targetY - 100; // Выше над платформой
			
			// Но проверяем что не слишком низко
			if (waypointY > maxTerrainHeight - 80) {
				waypointY = maxTerrainHeight - 80;
			}
			
			return {
				x: waypointX,
				y: waypointY,
				type: 'approach_to_landing'
			};
		}
	},
	
	// Проверка достижения точки пути
	hasReachedWaypoint: function (waypoint) {
		if (!waypoint) return true;
		
		var distX = waypoint.x - this._translate.x;
		var distY = waypoint.y - this._translate.y;
		var dist = Math.sqrt(distX * distX + distY * distY);
		
		// Разные пороги для разных типов точек
		if (waypoint.type === 'final_approach') {
			return dist < 20; // Близко к орбу
		} else if (waypoint.type === 'landing_approach') {
			return dist < 30; // Близко к платформе
		} else if (waypoint.type === 'approach' || waypoint.type === 'approach_to_landing') {
			return dist < 40;
		} else if (waypoint.type === 'emergency_climb') {
			return dist < 35; // Аварийный взлет
		} else {
			return dist < 60; // Крейсерские точки (cruise, cruise_with_orb)
		}
	},
	
	// Проверка безопасности пути до точки
	checkPathSafety: function (targetX, targetY) {
		if (!ige.server || !ige.server.getTerrainHeightAtX) {
			return true; // Нет данных - считаем безопасным
		}
		
		var myX = this._translate.x;
		var myY = this._translate.y;
		
		// Проверяем несколько точек между нами и целью
		var steps = 5;
		var minSafeDistance = 50; // Минимальное безопасное расстояние до земли
		
		for (var i = 1; i <= steps; i++) {
			var checkX = myX + (targetX - myX) * (i / steps);
			var checkY = myY + (targetY - myY) * (i / steps);
			
			var terrainHeight = ige.server.getTerrainHeightAtX(checkX);
			var altitude = terrainHeight - checkY;
			
			if (altitude < minSafeDistance) {
				return false; // Путь опасен - слишком близко к земле
			}
		}
		
		return true; // Путь безопасен
	},
	
	// Получить максимальную высоту рельефа между двумя точками
	// ВАЖНО: Возвращает максимальное Y (самую НИЗКУЮ точку рельефа)
	// Потому что в Canvas: Y=0 вверху, Y=600 внизу
	// Бот должен лететь ВЫШЕ (меньше Y) этой точки
	getMaxTerrainHeightBetween: function (x1, x2) {
		if (!ige.server || !ige.server.getTerrainHeightAtX) {
			// Если нет данных, возвращаем безопасное значение (низко)
			return 600; // Самый низ экрана
		}
		
		var startX = Math.min(x1, x2);
		var endX = Math.max(x1, x2);
		var maxHeight = -Infinity; // Ищем максимальный Y (самая низкая точка)
		
		// Проверяем каждые 40px (чтобы не пропустить пики)
		var step = 40;
		for (var x = startX; x <= endX; x += step) {
			var height = ige.server.getTerrainHeightAtX(x);
			if (height > maxHeight) {
				maxHeight = height;
			}
		}
		
		// Проверяем конечную точку
		var endHeight = ige.server.getTerrainHeightAtX(endX);
		if (endHeight > maxHeight) {
			maxHeight = endHeight;
		}
		
		// Проверка на валидность
		if (maxHeight === -Infinity || isNaN(maxHeight)) {
			return 600; // Безопасное значение
		}
		
		return maxHeight;
	},

	// Вспомогательный метод: получить текущую высоту над картой
	getCurrentAltitude: function () {
		if (!ige.server || !ige.server.getTerrainHeightAtX) {
			return 0;
		}
		var terrainHeight = ige.server.getTerrainHeightAtX(this._translate.x);
		return terrainHeight - this._translate.y; // Положительное = над картой
	},

	// Поиск ближайшего орба
	findNearestOrb: function () {
		var nearestOrb = null;
		var nearestDist = Infinity;
		
		if (ige.server.scene1 && ige.server.scene1._children) {
			var entities = ige.server.scene1._children;
			for (var i = 0; i < entities.length; i++) {
				var entity = entities[i];
				if (entity && entity._classId === 'Orb' && entity._translate) {
					// Пропускаем "старые орбы" (которые мы только что отпустили)
					if (this._oldOrb === entity) {
						continue;
					}
					
					var distX = entity._translate.x - this._translate.x;
					var distY = entity._translate.y - this._translate.y;
					var dist = Math.sqrt(distX * distX + distY * distY);
					
					if (dist < nearestDist) {
						nearestDist = dist;
						nearestOrb = entity;
					}
				}
			}
		}
		
		return nearestOrb;
	},

	// Поиск ближайшей платформы
	findNearestLandingPad: function () {
		if (!ige.server.landingPadPositions || ige.server.landingPadPositions.length === 0) {
			return null;
		}
		
		var nearestPad = null;
		var nearestDist = Infinity;
		
		for (var i = 0; i < ige.server.landingPadPositions.length; i++) {
			var pad = ige.server.landingPadPositions[i];
			var distX = pad[0] - this._translate.x;
			var distY = pad[1] - this._translate.y;
			var dist = Math.sqrt(distX * distX + distY * distY);
			
			if (dist < nearestDist) {
				nearestDist = dist;
				nearestPad = pad;
			}
		}
		
		return nearestPad;
	},

	// Переопределяем crash для сброса AI состояния
	crash: function () {
		// Вызываем родительский метод
		Player.prototype.crash.call(this);
		
		// Сбрасываем AI состояние
		this._aiState = 'idle';
		this._targetOrb = null;
		this._targetLandingPad = null;
		this._landingAttempts = 0;
		this._currentWaypoint = null;
		this._needSafeAltitude = false;
	},

	// Переопределяем respawn для сброса счетчиков
	respawn: function () {
		// Вызываем родительский метод
		Player.prototype.respawn.call(this);
		
		// Сбрасываем счетчики для новой задержки
		this._botTickCounter = 0;
		this._botCanMove = false;
		this._aiTickCounter = 0;
		
		// Сбрасываем AI состояние
		this._aiState = 'idle';
		this._targetOrb = null;
		this._targetLandingPad = null;
		this._landingAttempts = 0;
		this._currentWaypoint = null;
		this._needSafeAltitude = false;
	}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = BotPlayer; }

