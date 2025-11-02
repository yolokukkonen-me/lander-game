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
			return;
		}
		
		// УМНАЯ ЛОГИКА: Сначала набираем безопасную высоту
		var currentAltitude = this.getCurrentAltitude();
		var SAFE_FLIGHT_ALTITUDE = 100; // Безопасная высота для полета
		
		if (this._needSafeAltitude && currentAltitude < SAFE_FLIGHT_ALTITUDE) {
			// Взлетаем вертикально вверх до безопасной высоты
			this.flyTowards(this._translate.x, this._translate.y - 100);
			return;
		} else if (this._needSafeAltitude) {
			// Достигли безопасной высоты
			this._needSafeAltitude = false;
		}
		
		// Летим к орбу (подлетаем сверху для безопасности)
		var targetX = this._targetOrb._translate.x;
		var targetY = this._targetOrb._translate.y - 30; // Подлетаем чуть выше орба
		
		this.flyTowards(targetX, targetY);
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
			return;
		}
		
		// УМНАЯ ЛОГИКА: Сначала набираем безопасную высоту с орбом
		var currentAltitude = this.getCurrentAltitude();
		var SAFE_FLIGHT_ALTITUDE = 100;
		
		if (this._needSafeAltitude && currentAltitude < SAFE_FLIGHT_ALTITUDE) {
			// Взлетаем вертикально вверх до безопасной высоты
			this.flyTowards(this._translate.x, this._translate.y - 100);
			return;
		} else if (this._needSafeAltitude) {
			// Достигли безопасной высоты
			this._needSafeAltitude = false;
		}
		
		// Летим к платформе
		if (this._targetLandingPad) {
			var padX = this._targetLandingPad[0];
			var padY = this._targetLandingPad[1] - 80; // Подлетаем сверху
			
			this.flyTowards(padX, padY);
			
			// Получаем текущую скорость для проверки
			var velocity = this._box2dBody.GetLinearVelocity();
			var currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
			
			// Если близко к платформе И скорость безопасная, начинаем посадку
			var distX = padX - this._translate.x;
			var distY = (this._targetLandingPad[1] - 50) - this._translate.y;
			var dist = Math.sqrt(distX * distX + distY * distY);
			
			// Начинаем посадку только если близко и скорость небольшая
			if (dist < 120 && currentSpeed < 2.0) {
				this._aiState = 'landing';
				this._landingAttempts = 0;
			}
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
	flyTowards: function (targetX, targetY) {
		var distX = targetX - this._translate.x;
		var distY = targetY - this._translate.y;
		var distance = Math.sqrt(distX * distX + distY * distY);
		
		// Получаем текущую скорость
		var velocity = this._box2dBody.GetLinearVelocity();
		var currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
		
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
		
		// 2. Тормозим если близко к цели
		var brakingDistance = currentSpeed * 30; // Дистанция торможения
		if (distance < brakingDistance) {
			needsBraking = true;
		}
		
		// 3. Тормозим если слишком близко к карте
		if (altitudeAboveTerrain < this._safeAltitude && velocity.y > 0.5) {
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
			} else if (Math.abs(angleDiff) < this._thrustAccuracy && this._fuel > 10) {
				// Обычный полет - только если смотрим в правильную сторону
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
		this._needSafeAltitude = false;
	}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = BotPlayer; }

