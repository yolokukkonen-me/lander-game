var OrbPointer = IgeEntity.extend({
	classId: 'OrbPointer',

	init: function () {
		IgeEntity.prototype.init.call(this);
		
		this.width(80)
			.height(80)
			.layer(10) // Поверх всех объектов (высокий layer)
			.depth(100); // Дополнительная глубина
		
		this._circleRadius = 20; // Радиус окружности вокруг корабля (на 50% ближе: 35 * 0.7 * 0.8 = 20)
		this._dotRadius = 8; // Радиус индикаторной точки
		this._animationTime = 0; // Время для анимации
		this._hideStartTime = null; // Время начала исчезновения
		this._wasHiding = false; // Флаг для отслеживания состояния скрытия
	},
	
	/**
	 * Переопределяем рендеринг для отрисовки индикатора-стрелки
	 */
	tick: function (ctx) {
		// Вызываем родительский tick
		IgeEntity.prototype.tick.call(this, ctx);
		
		// Проверяем, нужно ли скрывать стрелки (если орб захвачен)
		var shouldHide = false;
		if (this._parent && this._parent._carryingOrb) {
			shouldHide = true;
			// Запускаем анимацию исчезновения
			if (!this._wasHiding) {
				this._hideStartTime = this._animationTime;
				this._wasHiding = true;
			}
		} else {
			// Орб освобожден - сбрасываем состояние
			if (this._wasHiding) {
				this._hideStartTime = null;
				this._wasHiding = false;
			}
		}
		
		// Обновляем время анимации
		this._animationTime += ige._tickDelta / 1000; // Переводим в секунды
		
		// Окружность не рисуем (прозрачная)
		
		// Рисуем индикаторные уголки на окружности (3 штуки: > >> >>>)
		if (this._dotAngle !== undefined) {
			// Вычисляем базовую позицию на окружности
			var baseX = Math.sin(this._dotAngle) * this._circleRadius;
			var baseY = -Math.cos(this._dotAngle) * this._circleRadius;
			
			// Рисуем 3 уголка с эффектом последовательной волны
			for (var i = 0; i < 3; i++) {
				var alpha = this._calculateArrowAlpha(i, shouldHide);
				
				// Рисуем уголок только если он видим
				if (alpha > 0.05) {
					ctx.save();
					
					// Смещение каждого уголка (> >> >>>)
					var offset = i * 5; // Расстояние между уголками
					var arrowX = baseX + Math.sin(this._dotAngle) * offset;
					var arrowY = baseY - Math.cos(this._dotAngle) * offset;
					
					// Перемещаемся к позиции уголка
					ctx.translate(arrowX, arrowY);
					
					// Поворачиваем уголок в направлении на орб
					ctx.rotate(this._dotAngle);
					
					// Рисуем уголок белым
					ctx.strokeStyle = 'rgba(255, 255, 255, ' + alpha + ')';
					ctx.lineWidth = 2;
					ctx.lineCap = 'round';
					ctx.lineJoin = 'miter';
					
					// Свечение для ярких уголков
					if (alpha > 0.6) {
						ctx.shadowBlur = 6;
						ctx.shadowColor = 'rgba(255, 255, 255, ' + (alpha * 0.8) + ')';
					}
					
					ctx.beginPath();
					ctx.moveTo(-3, 2);     // Левая линия
					ctx.lineTo(0, -2);     // Вершина (указывает на орб)
					ctx.lineTo(3, 2);      // Правая линия
					ctx.stroke();
					
					ctx.shadowBlur = 0;
					ctx.restore();
				}
			}
		}
	},
	
	/**
	 * Вычисляет прозрачность (alpha) для конкретного уголка
	 * @param {number} index - индекс уголка (0, 1, 2)
	 * @param {boolean} shouldHide - нужно ли скрывать (орб захвачен)
	 * @returns {number} alpha (0..1)
	 */
	_calculateArrowAlpha: function(index, shouldHide) {
		var alpha = 0;
		
		// РЕЖИМ 1: Орб захвачен - уголки исчезают последовательно (1→2→3)
		if (shouldHide && this._hideStartTime !== null) {
			var hideElapsed = this._animationTime - this._hideStartTime;
			var hideDelay = index * 0.25;      // 0, 0.25, 0.5 сек
			var hideDuration = 0.25;            // 0.25 сек на исчезновение
			
			if (hideElapsed < hideDelay) {
				// Еще не началось - показываем ярко
				alpha = 1.0;
			} else if (hideElapsed < hideDelay + hideDuration) {
				// Исчезает сейчас
				var phase = (hideElapsed - hideDelay) / hideDuration;
				alpha = 1.0 - phase;
			} else {
				// Уже исчезла
				alpha = 0;
			}
		} 
		// РЕЖИМ 2: Нормальное мигание (загорание 1→2→3 → все гаснут)
		else {
			var cycleDuration = 2.5; // Увеличено на 25% для более медленного мигания
			var cyclePhase = (this._animationTime % cycleDuration) / cycleDuration; // 0..1
			
			// Фазы цикла:
			// 0.0-0.3: Уголки загораются последовательно
			// 0.3-0.7: Все уголки горят ярко
			// 0.7-1.0: Все уголки гаснут одновременно
			
			var fadeInStart = index * 0.1;           // 0, 0.1, 0.2
			var fadeInEnd = fadeInStart + 0.1;       // 0.1, 0.2, 0.3
			var brightStart = 0.3;                   // Все горят ярко
			var fadeOutStart = 0.7;                  // Начало затухания
			
			if (cyclePhase < fadeInStart) {
				// Еще не началось загорание
				alpha = 0;
			} else if (cyclePhase < fadeInEnd) {
				// Загорается
				var phase = (cyclePhase - fadeInStart) / 0.1;
				alpha = Math.sin(phase * Math.PI * 0.5); // 0→1
			} else if (cyclePhase < fadeOutStart) {
				// Горит ярко
				alpha = 1.0;
			} else {
				// Гаснет
				var phase = (cyclePhase - fadeOutStart) / (1.0 - fadeOutStart);
				alpha = 1.0 - phase; // 1→0
			}
		}
		
		return Math.max(0, Math.min(1, alpha));
	}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = OrbPointer; }

