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
		
		// Параметры AI (оптимизированы на основе анализа игрока)
		this._turnSpeed = 0.5;
		this._thrustAccuracy = 0.3;
		this._maxSpeed = 2.5;        // Чуть выше крейсерской (2.03)
		this._safeAltitude = 90;     // Средняя высота игрока: 88 px
		
		// Для стабильной посадки
		this._landingAttempts = 0;
		this._maxLandingAttempts = 300;
		
		// Система планирования пути
		this._currentWaypoint = null; // Текущая точка пути
		this._needSafeAltitude = false; // Флаг необходимости набора высоты
		
		// PID режим
		this._usePID = false; // ОТКЛЮЧЕНО - возвращаемся к старой логике
		this._pid = null;
		this._pidConfig = {
			angle: { kp: 0.8, ki: 0.0, kd: 0.2, deadband: 0.05 },
			altitude: { kp: 0.15, ki: 0.0, kd: 0.3, deadband: 5 },
			speed: { kp: 0.2, ki: 0.0, kd: 0.05, deadband: 0.15 }
		};
		this._pidTargets = { desiredAltitudeY: null, desiredSpeed: 1.2 };
		this._pidInitialized = false; // Отложенная инициализация
		
		// Метрики состояний для повторных попыток
		this._prevState = null;
		this._stateTicks = 0;
		this._lastProgressDist = null;
		this._noProgressTicks = 0;
		
		// Активный маршрут (последовательность waypoints)
		this._activePath = [];
		
		// DEBUG / LOGGING (server-side)
		this._debugAI = false; // Отключено
		this._logAiLast = {};
		this._logAiThrottleMs = 500;
	},

	// Stream bot path to clients for debug rendering
	streamSectionData: function (sectionId, data) {
		if (sectionId === 'botPath') {
			if (data !== undefined) {
				// CLIENT: store debug path
				var parsed = (typeof data === 'string') ? JSON.parse(data) : data;
				this._debugBotPath = parsed && parsed.path ? parsed.path : [];
				return;
			} else {
				// SERVER: only for bots, send simplified path
				var out = [];
				if (this._activePath && this._activePath.length) {
					for (var i = 0; i < this._activePath.length && i < 12; i++) {
						var n = this._activePath[i];
						out.push({ x: Math.round(n.x), y: Math.round(n.y), mode: n.mode });
					}
				}
				return JSON.stringify({ path: out });
			}
		}
		// Fallback to Player implementation
		return Player.prototype.streamSectionData.call(this, sectionId, data);
	},

	// Hook into tick
	tick: function (ctx) {
		// Server AI already handled in this class earlier
		return Player.prototype.tick.call(this, ctx);
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
		// Отложенная инициализация PID (после того как PIDController определен)
		if (!this._pidInitialized && this._usePID) {
			this._initPidControllers();
			this._pidInitialized = true;
		}
		
		// Обновление счетчиков по смене состояния
		if (this._prevState !== this._aiState) {
			this._resetStateMetrics();
			this._prevState = this._aiState;
		}

		if (this._usePID) {
			// PID-машина состояний
			switch (this._aiState) {
				case 'idle':
					this.pidIdle();
					break;
				case 'seekingOrb':
					this.pidSeekOrb();
					break;
				case 'carryingOrb':
					this.pidCarryOrb();
					break;
				case 'landing':
					this.pidLanding();
					break;
			}
			this._stateTicks++;
			return;
		}

		// Старый режим (fallback)
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

	_resetStateMetrics: function () {
		this._stateTicks = 0;
		this._lastProgressDist = null;
		this._noProgressTicks = 0;
	},

	// ---------- LOGGING HELPERS (server only) ----------
	_logAi: function (tag, obj) {
		if (!ige.isServer || !this._debugAI) return;
		try {
			var id = (this.id ? this.id() : this._id) || 'bot';
			console.log('[BOT]', id, tag, JSON.stringify(obj));
		} catch (e) {}
	},
	_logAiT: function (key, tag, obj) {
		if (!ige.isServer || !this._debugAI) return;
		var now = ige._currentTime || Date.now();
		var last = this._logAiLast[key] || 0;
		if (now - last >= this._logAiThrottleMs) {
			this._logAiLast[key] = now;
			this._logAi(tag, obj);
		}
	},

	_currentWaypointNode: function () {
		if (!this._activePath || this._activePath.length === 0) return null;
		return this._activePath[0];
	},

	_advancePathIfReached: function () {
		var wp = this._currentWaypointNode();
		if (!wp) return;
		var dx = wp.x - this._translate.x;
		var dy = wp.y - this._translate.y;
		var dist = Math.sqrt(dx * dx + dy * dy);
		var thresh = (wp.mode === 'final_approach' || wp.mode === 'landing') ? 25 : 45;
		if (dist < thresh) {
			this._activePath.shift();
			this._logAi('advanceWp', { left: (this._activePath && this._activePath.length) || 0 });
		}
	},

	_ensurePathTo: function (tx, ty, forOrb) {
		// Не пере-планировать каждый тик: только если цель значительно сменилась
		// или прошло достаточно времени, или активный путь пуст
		var now = ige._currentTime || Date.now();
		if (!this._lastPlanAt) this._lastPlanAt = 0;
		if (!this._lastPlannedTarget) this._lastPlannedTarget = { x: null, y: null, forOrb: null };

		var targetDelta = Math.abs((this._lastPlannedTarget.x || 0) - tx) + Math.abs((this._lastPlannedTarget.y || 0) - ty);
		var timeDelta = now - this._lastPlanAt;
		var needReplan = false;
		if (!this._activePath || this._activePath.length === 0) needReplan = true;
		else if (targetDelta > 20) needReplan = true;
		else if (timeDelta > 1500) needReplan = true;

		if (!needReplan) return;

		this._activePath = this._planPath(tx, ty, forOrb);
		this._lastPlannedTarget = { x: tx, y: ty, forOrb: forOrb };
		this._lastPlanAt = now;
	},

	_planPath: function (tx, ty, forOrb) {
		var path = [];
		var x0 = this._translate.x, y0 = this._translate.y;
		var maxY = this.getMaxTerrainHeightBetween(x0, tx);
		var baseMargin = forOrb ? 180 : 160; // больше запас над рельефом
		var cruiseY = Math.min(560, Math.max(40, maxY - baseMargin));
		cruiseY = this._applyPlayerAvoidanceToY(cruiseY, x0, tx);

		// Шаг 1: набор высоты (вертикально вверх на безопасную)
		path.push({ x: x0, y: cruiseY, mode: forOrb ? 'cruise' : 'cruise_with_orb' });
		
		// Шаг 2: горизонтальный перелет на безопасной высоте
		path.push({ x: tx, y: cruiseY, mode: forOrb ? 'cruise' : 'cruise_with_orb' });
		
		// Шаг 3: топ-даун точка над целью
		var topDownY = Math.min(ty - 80, maxY - 60);
		topDownY = Math.max(40, topDownY);
		path.push({ x: tx, y: topDownY, mode: 'approach' });
		
		// Шаг 4: финальный подход немного выше цели
		var finalY = Math.min(ty - 20, maxY - 50);
		finalY = Math.max(40, finalY);
		path.push({ x: tx, y: finalY, mode: 'final_approach' });

		// Проверка безопасности и коррекция: если где-то близко к земле — поднять cruiseY и перестроить
		if (!this._pathIsSafe(path)) {
			cruiseY = Math.max(40, cruiseY - 40);
			path = [
				{ x: x0, y: cruiseY, mode: forOrb ? 'cruise' : 'cruise_with_orb' },
				{ x: tx, y: cruiseY, mode: forOrb ? 'cruise' : 'cruise_with_orb' },
				{ x: tx, y: topDownY, mode: 'approach' },
				{ x: tx, y: finalY, mode: 'final_approach' }
			];
		}
		this._logAiT('plan', 'planPath', { from: {x: Math.round(x0), y: Math.round(y0)}, to: {x: Math.round(tx), y: Math.round(ty)}, cruiseY: Math.round(cruiseY), topDownY: Math.round(topDownY), finalY: Math.round(finalY), maxTerrainY: Math.round(maxY), forOrb: !!forOrb });
		return path;
	},

	_pathIsSafe: function (path) {
		for (var i = 1; i < path.length; i++) {
			var a = path[i - 1], b = path[i];
			if (!this.checkPathSafety(b.x, b.y)) return false;
		}
		return true;
	},

	_applyPlayerAvoidanceToY: function (y, x1, x2) {
		// Простое избегание: если рядом с нами по X есть игрок, поднимем маршрут выше
		var others = this._getOtherPlayers();
		for (var i = 0; i < others.length; i++) {
			var p = others[i];
			if (p) {
				var withinX = (p.x >= Math.min(x1, x2) - 60) && (p.x <= Math.max(x1, x2) + 60);
				var dy = Math.abs(p.y - y);
				if (withinX && dy < 120) {
					// Поднимаем маршрут на 40px (вверх = меньше Y)
					y = Math.max(40, y - 40);
				}
			}
		}
		return y;
	},

	_getOtherPlayers: function () {
		var res = [];
		if (!ige.server || !ige.server.players) return res;
		for (var id in ige.server.players) {
			var pl = ige.server.players[id];
			if (pl && pl !== this && pl._translate) {
				res.push({ x: pl._translate.x, y: pl._translate.y });
			}
		}
		return res;
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
		
		// УПРОЩЕНО: Пропускаем набор высоты, сразу летим к орбу
		if (this._needSafeAltitude) {
			console.log('[BOT] Пропускаем набор высоты, летим к орбу');
			this._needSafeAltitude = false;
			this._currentWaypoint = null;
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
		
		// УПРОЩЕНО: Пропускаем набор высоты, сразу летим к платформе
		if (this._needSafeAltitude) {
			console.log('[BOT] Пропускаем набор высоты, летим к платформе');
			this._needSafeAltitude = false;
			this._currentWaypoint = null;
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
		
		// Поворачиваем к нулю (из анализа: angle ~0)
		if (Math.abs(currentAngle) > 0.10) {
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
			
			// КРИТИЧНО: Контроль вертикальной скорости (из анализа: 0.66)
			var verticalSpeed = velocity.y;
			var targetVerticalSpeed = 0.7; // Целевая скорость падения (из анализа: 0.66)
			var maxVerticalSpeed = 1.0; // Максимальная безопасная скорость
			
			// Если падаем слишком быстро - ТОРМОЗИМ
			if (verticalSpeed > maxVerticalSpeed) {
				this.controls.thrust = true;
			}
			// Если падаем слишком медленно и еще высоко - отключаем газ
			else if (verticalSpeed < targetVerticalSpeed && distY > 20) {
				this.controls.thrust = false;
			}
			// Если близко к платформе - активно тормозим (из анализа: начинать на 24px)
			else if (distY < 25 && verticalSpeed > 0.5) {
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
			// Режим торможения перед орбом (из анализа: скорость подхода 2.14)
			else if (shouldSlowDown && currentSpeed > 2.0) {
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
		
		// ЦЕЛЬ: Скорость подхода к орбу (из анализа: 2.14)
		var MAX_APPROACH_SPEED = 1.5;
		
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
		
		// Проверяем больше точек между нами и целью
		var steps = 10;
		var minSafeDistance = 90; // Минимальное безопасное расстояние до земли
		
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

	// ===========================
	// PID-РАЗДЕЛ
	// ===========================
	_initPidControllers: function () {
		var c = this._pidConfig;
		this._pid = {
			angle: new PIDController(c.angle.kp, c.angle.ki, c.angle.kd),
			altitude: new PIDController(c.altitude.kp, c.altitude.ki, c.altitude.kd),
			speed: new PIDController(c.speed.kp, c.speed.ki, c.speed.kd)
		};
	},

	_pidNormalizeAngle: function (angle) {
		var wound = Math.round(angle / (2 * Math.PI));
		angle -= 2 * Math.PI * wound;
		return angle;
	},

	pidIdle: function () {
		var orb = this.findNearestOrb();
		if (orb) {
			this._targetOrb = orb;
			this._aiState = 'seekingOrb';
		}
	},

	pidSeekOrb: function () {
		if (!this._targetOrb || !this._targetOrb._translate) {
			this._aiState = 'idle';
			this._targetOrb = null;
			return;
		}

		// Если уже несем этот орб
		if (this._carryingOrb && this._orb === this._targetOrb) {
			this._aiState = 'carryingOrb';
			this._targetLandingPad = this.findNearestLandingPad();
			return;
		}

		var targetX = this._targetOrb._translate.x;
		var targetY = this._targetOrb._translate.y;
		// Прогресс к цели
		var dxp = targetX - this._translate.x;
		var dyp = targetY - this._translate.y;
		var dist = Math.sqrt(dxp * dxp + dyp * dyp);
		if (this._lastProgressDist == null || dist < this._lastProgressDist - 5) {
			this._noProgressTicks = 0;
		} else {
			this._noProgressTicks++;
		}
		this._lastProgressDist = dist;

		// Режим: если далеко по X — крейсерский полет с безопасной высотой,
		// если близко — финальный подход снизу-вверх
		// Обеспечиваем маршрут до орба (terrain-aware, top-down)
		this._ensurePathTo(targetX, targetY, /*forOrb*/ true);
		var wp = this._currentWaypointNode();
		var mode = wp ? wp.mode : 'cruise';
		this._pidNavigateTo(wp.x, wp.y, mode);
		this._advancePathIfReached();
		this._logAiT('seek', 'pidSeekOrb', {
			mode: mode,
			wp: wp,
			alt: Math.round(this.getCurrentAltitude()),
			pos: {x: Math.round(this._translate.x), y: Math.round(this._translate.y)},
			orb: {x: Math.round(targetX), y: Math.round(targetY)},
			pathLen: (this._activePath && this._activePath.length) || 0,
			noProg: this._noProgressTicks,
			stateTicks: this._stateTicks
		});

		// Таймауты/повторные попытки
		if (this._stateTicks > 900 || this._noProgressTicks > 240) { // 15с или >4с без прогресса
			var newOrb = this.findNearestOrb();
			if (newOrb) {
				this._targetOrb = newOrb;
				this._needSafeAltitude = true;
				this._currentWaypoint = null;
				this._resetStateMetrics();
				console.log('[BOT] Re-acquire orb target');
			} else {
				this._aiState = 'idle';
			}
		}
	},

	pidCarryOrb: function () {
		if (!this._carryingOrb) {
			this._aiState = 'idle';
			this._targetLandingPad = null;
			return;
		}

		if (!this._targetLandingPad) {
			this._targetLandingPad = this.findNearestLandingPad();
			if (!this._targetLandingPad) {
				this._aiState = 'idle';
				return;
			}
		}

		var targetX = this._targetLandingPad[0];
		var targetY = this._targetLandingPad[1];
		// Прогресс к платформе
		var dxp = targetX - this._translate.x;
		var dyp = targetY - this._translate.y;
		var distNow = Math.sqrt(dxp * dxp + dyp * dyp);
		if (this._lastProgressDist == null || distNow < this._lastProgressDist - 5) {
			this._noProgressTicks = 0;
		} else {
			this._noProgressTicks++;
		}
		this._lastProgressDist = distNow;
		var dx = targetX - this._translate.x;
		var dy = targetY - this._translate.y;
		var dist = Math.sqrt(dx * dx + dy * dy);
		// Строим маршрут к платформе
		this._ensurePathTo(targetX, targetY, /*forOrb*/ false);
		var wp = this._currentWaypointNode();
		var mode = wp ? wp.mode : 'cruise_with_orb';
		this._pidNavigateTo(wp.x, wp.y, mode);
		this._advancePathIfReached();
		this._logAiT('carry', 'pidCarryOrb', {
			mode: mode,
			wp: wp,
			alt: Math.round(this.getCurrentAltitude()),
			pos: {x: Math.round(this._translate.x), y: Math.round(this._translate.y)},
			pad: {x: Math.round(targetX), y: Math.round(targetY)},
			pathLen: (this._activePath && this._activePath.length) || 0,
			noProg: this._noProgressTicks,
			stateTicks: this._stateTicks
		});

		// Условие перехода к посадке
		if (dist < 100) {
			this._aiState = 'landing';
		}

		// Таймауты/повторные попытки
		if (this._stateTicks > 900 || this._noProgressTicks > 240) { // 15с или >4с без прогресса
			this._needSafeAltitude = true;
			this._currentWaypoint = null;
			this._resetStateMetrics();
			console.log('[BOT] Replan path to landing pad');
		}
	},

	pidLanding: function () {
		if (this._landed) {
			this._aiState = 'idle';
			this._targetOrb = null;
			this._targetLandingPad = null;
			return;
		}

		if (!this._targetLandingPad) {
			this._aiState = 'idle';
			return;
		}

		var targetX = this._targetLandingPad[0];
		var targetY = this._targetLandingPad[1] - 40; // точка чуть выше платформы
		this._pidTargets.desiredSpeed = 0.6;
		this._pidNavigateTo(targetX, targetY, 'landing');

		// Если слишком долго не садимся — делаем повторную попытку захода
		if (this._stateTicks > 600) { // ~10 секунд на заход
			this._aiState = 'carryingOrb';
			this._needSafeAltitude = true;
			this._currentWaypoint = null;
			this._resetStateMetrics();
			console.log('[BOT] Landing timeout — retry approach');
		}
	},

	_pidDesiredAltitudeYFor: function (targetX, targetY, mode) {
		var currentX = this._translate.x;
		var maxTerrainY = this.getMaxTerrainHeightBetween(currentX, targetX);
		// Для крейсерского/вертикального этапа целевая высота = Y текущего waypoint
		if (mode === 'cruise' || mode === 'cruise_with_orb') return targetY;
		// Для подхода сверху — не ниже безопасного отступа от рельефа
		if (mode === 'approach' || mode === 'approach_to_landing') return Math.min(targetY, maxTerrainY - 80);
		// Для посадки держим чуть выше цели, но не ниже рельефа + отступ
		if (mode === 'landing') return Math.min(targetY, maxTerrainY - 70);
		return Math.min(targetY, maxTerrainY - 120);
	},

	_pidNavigateTo: function (targetX, targetY, mode) {
		// 1) УЛУЧШЕННАЯ ЛОГИКА: Наклон к цели, но ограниченный для плавности
		var distX = targetX - this._translate.x;
		var distY = targetY - this._translate.y;
		
		// Рассчитываем угол к цели (как раньше)
		var angleToTarget = Math.atan2(distY, distX) + Math.PI / 2;
		
		// Базовый угол: преимущественно вверх
		var baseAngle = 0;
		
		// Максимальный допустимый угол отклонения от вертикали
		var maxDeviation = (mode === 'landing') ? 0.4 : 0.8; // При посадке ~23 град, иначе ~46 град
		
		// Вычисляем желаемый угол: стремимся к цели, но ограничиваем отклонение от вертикали
		var rawTargetAngle = this._pidNormalizeAngle(angleToTarget);
		var deviation = rawTargetAngle - baseAngle;
		
		// Нормализуем deviation в диапазон [-PI, PI]
		if (deviation > Math.PI) deviation -= 2 * Math.PI;
		if (deviation < -Math.PI) deviation += 2 * Math.PI;
		
		// Ограничиваем отклонение
		var clampedDeviation = Math.max(-maxDeviation, Math.min(maxDeviation, deviation));
		
		var desiredAngle = baseAngle + clampedDeviation;
		desiredAngle = this._pidNormalizeAngle(desiredAngle);
		var currentAngle = this._pidNormalizeAngle(this._rotate.z);
		var angleError = desiredAngle - currentAngle;
		if (angleError > Math.PI) angleError -= 2 * Math.PI;
		if (angleError < -Math.PI) angleError += 2 * Math.PI;
		var angleOut = this._pid.angle.update(0, -angleError); // хотим angleError -> 0
		var angleDead = this._pidConfig.angle.deadband;
		if (angleOut > angleDead) {
			this.controls.right = true; this.controls.left = false;
		} else if (angleOut < -angleDead) {
			this.controls.left = true; this.controls.right = false;
		} else {
			this.controls.left = false; this.controls.right = false;
		}

		// 2) Контроль высоты PID по Y (работаем в координатах Y)
		var desiredY = this._pidDesiredAltitudeYFor(targetX, targetY, mode);
		// Ограничения экрана
		desiredY = Math.max(40, Math.min(560, desiredY));
		this._pidTargets.desiredAltitudeY = desiredY;
		var altitudeOut = this._pid.altitude.update(desiredY, this._translate.y);
		var altDead = this._pidConfig.altitude.deadband;

		// 3) Контроль скорости
		var v = this._box2dBody.GetLinearVelocity();
		var speed = Math.sqrt(v.x * v.x + v.y * v.y);
		var desiredSpeed = (mode === 'cruise' || mode === 'cruise_with_orb') ? 2.0 : (mode === 'landing' ? 0.5 : 1.0);
		this._pidTargets.desiredSpeed = desiredSpeed;
		var speedOut = this._pid.speed.update(desiredSpeed, speed);
		var spdDead = this._pidConfig.speed.deadband;

		// 3.5) Помощь при взлете: если стоим на платформе или почти нулевая скорость — даем газ без условий
		if (this._landed || speed < 0.3) {
			this.controls.thrust = this._fuel > 5; // минимальная проверка топлива
			this._logAiT('lift', 'liftOffAssist', { 
				speed: speed, 
				landed: !!this._landed, 
				deviation: +clampedDeviation.toFixed(2),
				desiredAngle: +desiredAngle.toFixed(2),
				currentAngle: +currentAngle.toFixed(2)
			});
			return;
		}

		// 4) Решение о тяге: приоритет высоты и безопасности
		var altitude = this.getCurrentAltitude();
		var safeAlt = 50;
		var verticalSpeed = v.y; // положительная = падение вниз
		var distToDesiredY = currentY - desiredY; // положительная = ниже цели
		
		var thrust = false;
		
		// Критическая высота - всегда тормозим падение
		if (altitude < safeAlt && verticalSpeed > 0.5) {
			thrust = true;
		}
		// Если нужно подняться (мы ниже цели)
		else if (distToDesiredY > 10) {
			// Даем тягу если падаем или медленно поднимаемся
			if (verticalSpeed > -1.5) {
				thrust = true;
			}
		}
		// Если нужно опуститься (мы выше цели)
		else if (distToDesiredY < -10) {
			// Даем тягу только если падаем слишком быстро
			if (verticalSpeed > 2.0) {
				thrust = true;
			}
		}
		// Близко к целевой высоте - поддерживаем hover
		else {
			// Компенсируем гравитацию, держим медленное падение
			if (verticalSpeed > 0.8) {
				thrust = true;
			}
		}

		// Газ если корабль смотрит достаточно вертикально (не перевернут)
		var angleAligned = Math.abs(currentAngle) < 1.0; // Не больше ~57 градусов от вертикали
		// Но если очень низко (еще не вышли на безопасную высоту) — игнорируем строгую проверку выравнивания
		if (altitude < safeAlt + 10) {
			angleAligned = Math.abs(currentAngle) < 1.5; // разрешаем больший допуск на старте
		}
		this.controls.thrust = thrust && angleAligned && this._fuel > 5;
		this._logAiT('nav', 'pidNavigate', {
			mode: mode,
			pos: {x: Math.round(this._translate.x), y: Math.round(this._translate.y)},
			wp: {x: Math.round(targetX), y: Math.round(targetY)},
			angleToTarget: +angleToTarget.toFixed(2),
			deviation: +clampedDeviation.toFixed(2),
			desiredAngle: +desiredAngle.toFixed(2),
			currentAngle: +currentAngle.toFixed(2),
			angleErr: +angleError.toFixed(2),
			angleAligned: angleAligned,
			altitudeY: Math.round(currentY),
			desiredY: Math.round(desiredY),
			distToDesiredY: Math.round(distToDesiredY),
			verticalSpeed: +verticalSpeed.toFixed(2),
			spd: +speed.toFixed(2),
			desSpd: desiredSpeed,
			altitude: Math.round(altitude),
			thrust: this.controls.thrust
		});
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
		this._prevState = null;
		this._resetStateMetrics();
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
		this._prevState = null;
		this._resetStateMetrics();
	}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = BotPlayer; }


// Простой PID контроллер
function PIDController(kp, ki, kd) {
	this.kp = kp; this.ki = ki; this.kd = kd;
	this.integral = 0;
	this.lastError = 0;
	this.update = function (target, current) {
		var error = target - current;
		this.integral += error;
		var derivative = error - this.lastError;
		this.lastError = error;
		return this.kp * error + this.ki * this.integral + this.kd * derivative;
	};
}

