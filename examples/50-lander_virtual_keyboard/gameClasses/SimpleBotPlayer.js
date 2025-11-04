/**
 * SimpleBotPlayer - Простой и надежный бот на основе анализа игрока
 * 
 * Оптимизирован на основе данных: player_training_1762207737151.json
 * - 689 записей игры
 * - 5 успешных посадок (velY: 0.66)
 * - 2 захвата орбов (скорость: 2.14)
 * - Средняя высота полета: 88px
 * - Крейсерская скорость: 2.03
 */

var SimpleBotPlayer = Player.extend({
	classId: 'SimpleBotPlayer',

	init: function (botId) {
		Player.prototype.init.call(this, botId);
		
		this._isBot = true;
		
		// Задержка старта (3 секунды)
		this._botTickCounter = 0;
		this._botStartDelay = 180; // ~3 сек при 60fps
		this._botCanMove = false;
		
		// Простая машина состояний
		this._state = 'idle'; // idle, toOrb, toBase, landing
		this._targetOrb = null;
		this._targetPad = null;
		
		// Параметры из анализа игрока
		this._params = {
			// Скорости (из анализа)
			cruiseSpeed: 2.0,        // Средняя крейсерская: 2.03
			approachSpeed: 1.5,      // Средняя подход к орбу: 2.14
			landingSpeed: 0.7,       // Средняя посадка: 0.66
			maxSpeed: 2.5,           // Предел скорости
			
			// Высоты (из анализа)
			safeAltitude: 90,        // Средняя высота: 88px
			minAltitude: 40,         // Минимум для безопасности
			
			// Углы
			angleThreshold: 0.3,     // Порог для включения тяги
			landingAngle: 0.1,       // Угол для посадки (почти вертикально)
			
			// Расстояния
			orbApproachDist: 100,    // Начать замедление
			padApproachDist: 100,    // Начать посадку
			arrivalDist: 40          // Считаем что прибыли
		};
		
		// Счетчики для логики
		this._stuckCounter = 0;
		this._maxStuckTicks = 300; // 5 секунд без прогресса
		this._lastPosition = { x: 0, y: 0 };
	},

	tick: function (ctx) {
		if (ige.isServer && !this._crashed) {
			this._botTickCounter++;
			
			// Ждем задержку старта
			if (this._botTickCounter < this._botStartDelay) {
				this.controls.left = false;
				this.controls.right = false;
				this.controls.thrust = false;
				this.controls.drop = false;
			} else {
				this._botCanMove = true;
			}
			
			// Обновляем AI
			if (this._botCanMove && this._botTickCounter % 6 === 0) {
				this.updateAI();
			}
		}
		
		Player.prototype.tick.call(this, ctx);
	},

	updateAI: function () {
		// Проверка застревания
		this.checkStuck();
		
		// Простая машина состояний
		switch (this._state) {
			case 'idle':
				this.aiIdle();
				break;
			case 'toOrb':
				this.aiToOrb();
				break;
			case 'toBase':
				this.aiToBase();
				break;
			case 'landing':
				this.aiLanding();
				break;
		}
	},

	// Проверка застревания
	checkStuck: function () {
		var dx = this._translate.x - this._lastPosition.x;
		var dy = this._translate.y - this._lastPosition.y;
		var moved = Math.sqrt(dx * dx + dy * dy);
		
		if (moved < 5) {
			this._stuckCounter++;
			if (this._stuckCounter > this._maxStuckTicks) {
				// Застряли - сбрасываем состояние
				console.log('[BOT] Застрял, сброс состояния');
				this._state = 'idle';
				this._targetOrb = null;
				this._targetPad = null;
				this._stuckCounter = 0;
			}
		} else {
			this._stuckCounter = 0;
		}
		
		this._lastPosition = { x: this._translate.x, y: this._translate.y };
	},

	// Состояние: ищем орб
	aiIdle: function () {
		this._targetOrb = this.findNearestOrb();
		
		if (this._targetOrb) {
			this._state = 'toOrb';
			console.log('[BOT] Орб найден, летим к нему');
		}
	},

	// Состояние: летим к орбу
	aiToOrb: function () {
		// Проверяем что орб еще существует
		if (!this._targetOrb || !this._targetOrb._translate) {
			this._state = 'idle';
			return;
		}
		
		// Если подобрали орб
		if (this._carryingOrb) {
			this._targetPad = this.findNearestLandingPad();
			this._state = 'toBase';
			console.log('[BOT] Орб подобран, летим на базу');
			return;
		}
		
		var orbX = this._targetOrb._translate.x;
		var orbY = this._targetOrb._translate.y;
		var dist = this.getDistanceTo(orbX, orbY);
		
		// Определяем нужно ли замедляться
		var targetSpeed = dist < this._params.orbApproachDist ? 
			this._params.approachSpeed : this._params.cruiseSpeed;
		
		this.flyToTarget(orbX, orbY, targetSpeed);
	},

	// Состояние: летим на базу с орбом
	aiToBase: function () {
		// Проверяем что у нас есть орб
		if (!this._carryingOrb) {
			this._state = 'idle';
			return;
		}
		
		if (!this._targetPad) {
			this._targetPad = this.findNearestLandingPad();
			if (!this._targetPad) {
				return;
			}
		}
		
		var padX = this._targetPad[0];
		var padY = this._targetPad[1];
		var dist = this.getDistanceTo(padX, padY);
		
		// Если близко - начинаем посадку
		if (dist < this._params.padApproachDist) {
			this._state = 'landing';
			console.log('[BOT] Начинаем посадку');
			return;
		}
		
		// Летим к платформе
		this.flyToTarget(padX, padY, this._params.cruiseSpeed);
	},

	// Состояние: садимся
	aiLanding: function () {
		// Успешно сели
		if (this._landed) {
			this._state = 'idle';
			this._targetPad = null;
			console.log('[BOT] Посадка успешна!');
			return;
		}
		
		// Потеряли орб
		if (!this._carryingOrb) {
			this._state = 'idle';
			return;
		}
		
		if (!this._targetPad) {
			this._state = 'toBase';
			return;
		}
		
		var padX = this._targetPad[0];
		var padY = this._targetPad[1];
		
		this.landOnPad(padX, padY);
	},

	// Основная логика полета к цели
	flyToTarget: function (targetX, targetY, targetSpeed) {
		var vel = this._box2dBody.GetLinearVelocity();
		var speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
		var altitude = this.getAltitude();
		
		// 1. Поворачиваемся к цели
		var targetAngle = this.getAngleToTarget(targetX, targetY);
		var currentAngle = this.normalizeAngle(this._rotate.z);
		var angleDiff = this.normalizeAngle(targetAngle - currentAngle);
		
		// Управление поворотом
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
		
		// 2. Управление тягой
		var shouldThrust = false;
		
		// КРИТИЧНО: Компенсация гравитации если падаем быстро
		if (vel.y > 1.5) {
			shouldThrust = true;
		}
		// Если смотрим в правильную сторону и нужно ускориться
		else if (Math.abs(angleDiff) < this._params.angleThreshold) {
			if (speed < targetSpeed && this._fuel > 10) {
				shouldThrust = true;
			}
		}
		// Если слишком низко - набираем высоту
		else if (altitude < this._params.minAltitude) {
			shouldThrust = true;
		}
		
		this.controls.thrust = shouldThrust;
	},

	// Логика посадки
	landOnPad: function (padX, padY) {
		var vel = this._box2dBody.GetLinearVelocity();
		var distX = padX - this._translate.x;
		var distY = padY - this._translate.y;
		
		// 1. Выравниваем корабль вертикально (из анализа: angle ~0)
		var currentAngle = this.normalizeAngle(this._rotate.z);
		
		if (Math.abs(currentAngle) > this._params.landingAngle) {
			if (currentAngle > 0) {
				this.controls.left = true;
				this.controls.right = false;
			} else {
				this.controls.left = false;
				this.controls.right = true;
			}
		} else {
			this.controls.left = false;
			this.controls.right = false;
		}
		
		// 2. Управление вертикальной скоростью
		// Из анализа: целевая velY = 0.7, max = 1.0
		var verticalSpeed = vel.y;
		var targetVelY = this._params.landingSpeed;
		
		// Если далеко по горизонтали - летим к платформе
		if (Math.abs(distX) > 20) {
			var targetAngle = Math.atan2(distY, distX) + Math.PI / 2;
			var angleDiff = this.normalizeAngle(targetAngle - this._rotate.z);
			
			if (Math.abs(angleDiff) < 0.3) {
				this.controls.thrust = true;
			}
		}
		// Близко - контролируем падение
		else {
			// Тормозим если падаем быстрее целевой скорости
			if (verticalSpeed > targetVelY + 0.2) {
				this.controls.thrust = true;
			}
			// Даем упасть если слишком медленно
			else if (verticalSpeed < targetVelY - 0.2 && distY > 10) {
				this.controls.thrust = false;
			}
			// Близко к платформе - активно тормозим
			else if (distY < 20 && verticalSpeed > 0.5) {
				this.controls.thrust = true;
			}
			else {
				this.controls.thrust = false;
			}
		}
	},

	// === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

	getDistanceTo: function (x, y) {
		var dx = x - this._translate.x;
		var dy = y - this._translate.y;
		return Math.sqrt(dx * dx + dy * dy);
	},

	getAngleToTarget: function (x, y) {
		var dx = x - this._translate.x;
		var dy = y - this._translate.y;
		return Math.atan2(dx, -dy); // Angle в системе Isogenic (Y вниз)
	},

	normalizeAngle: function (angle) {
		while (angle > Math.PI) angle -= 2 * Math.PI;
		while (angle < -Math.PI) angle += 2 * Math.PI;
		return angle;
	},

	getAltitude: function () {
		if (!ige.server || !ige.server.getTerrainHeightAtX) {
			return 100; // Default
		}
		var terrainY = ige.server.getTerrainHeightAtX(this._translate.x);
		return terrainY - this._translate.y; // Положительное = над землей
	},

	findNearestOrb: function () {
		var nearest = null;
		var minDist = Infinity;
		
		if (ige.server.scene1 && ige.server.scene1._children) {
			for (var i = 0; i < ige.server.scene1._children.length; i++) {
				var entity = ige.server.scene1._children[i];
				if (entity && entity._classId === 'Orb' && entity._translate) {
					// Пропускаем старый орб
					if (this._oldOrbId && entity.id() === this._oldOrbId) {
						continue;
					}
					
					var dist = this.getDistanceTo(entity._translate.x, entity._translate.y);
					if (dist < minDist) {
						minDist = dist;
						nearest = entity;
					}
				}
			}
		}
		
		return nearest;
	},

	findNearestLandingPad: function () {
		if (!ige.server.landingPadPositions || ige.server.landingPadPositions.length === 0) {
			return null;
		}
		
		var nearest = null;
		var minDist = Infinity;
		
		for (var i = 0; i < ige.server.landingPadPositions.length; i++) {
			var pad = ige.server.landingPadPositions[i];
			var dist = this.getDistanceTo(pad[0], pad[1]);
			
			if (dist < minDist) {
				minDist = dist;
				nearest = pad;
			}
		}
		
		return nearest;
	},

	// Переопределяем crash и respawn для сброса AI
	crash: function () {
		Player.prototype.crash.call(this);
		this._state = 'idle';
		this._targetOrb = null;
		this._targetPad = null;
		this._stuckCounter = 0;
	},

	respawn: function () {
		Player.prototype.respawn.call(this);
		this._state = 'idle';
		this._targetOrb = null;
		this._targetPad = null;
		this._stuckCounter = 0;
		this._botTickCounter = this._botStartDelay + 180; // +3 сек задержки
	}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { 
	module.exports = SimpleBotPlayer; 
}





