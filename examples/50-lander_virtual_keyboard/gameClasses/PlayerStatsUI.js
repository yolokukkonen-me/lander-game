var PlayerStatsUI = IgeEntity.extend({
	classId: 'PlayerStatsUI',

	init: function () {
		IgeEntity.prototype.init.call(this);
		
		// Минимальный размер entity
		this.width(150)
			.height(120)
			.layer(1000);
	},

	tick: function (ctx) {
		if (!ige.isClient || !ige.client || !ige.client.objectScene) {
			return;
		}
		
		// Получаем размеры viewport для абсолютного позиционирования
		var vp = ige.client.vp1;
		if (!vp) {
			return;
		}
		
		var vpWidth = vp._bounds2d.x;
		var vpHeight = vp._bounds2d.y;
		
		// Позиционируем entity в левом верхнем углу
		// (0, 0) в ignoreCamera scene - это центр viewport
		// Левый верхний угол = (-vpWidth/2, -vpHeight/2)
		// Добавляем половину размера entity, чтобы его центр был в нужной позиции
		var marginLeft = 2; // Минимальный отступ слева
		var marginTop = 2;  // Минимальный отступ сверху
		this.translateTo(-vpWidth/2 + this._bounds2d.x/2 + marginLeft, -vpHeight/2 + this._bounds2d.y/2 + marginTop, 0);
		
		// Собираем список игроков
		var playerList = [];
		var sceneChildren = ige.client.objectScene._children;
		if (!sceneChildren) {
			return;
		}
		
		for (var i = 0; i < sceneChildren.length; i++) {
			var entity = sceneChildren[i];
			if (entity && entity._classId === 'Player') {
				playerList.push({
					slotNumber: entity._playerNumber || 0,
					orbsCollected: entity._orbsCollected || 0,
					shipColor: entity._shipColor || '#00d4ff'
				});
			}
		}
		
		if (playerList.length === 0) {
			return;
		}
		
		// Сортируем по слотам
		playerList.sort(function(a, b) { return a.slotNumber - b.slotNumber; });
		
		// Рисуем статистику
		ctx.save();
		
		var startX = -72; // Относительно центра entity - максимально влево
		var startY = -58; // Относительно центра entity - максимально вверх (высота entity = 120, center = 60, startY = -58 значит 2px от верха entity)
		var lineHeight = 30;
		var shipScale = 1/3;
		var orbScale = 1/3;
		
		for (var i = 0; i < playerList.length; i++) {
			var playerData = playerList[i];
			var yPos = startY + (i * lineHeight);
			
			// Рисуем миниатюрный корабль
			ctx.save();
			ctx.translate(startX, yPos);
			ctx.scale(shipScale, shipScale);
			ctx.fillStyle = playerData.shipColor;
			ctx.strokeStyle = playerData.shipColor;
			ctx.lineWidth = 2;
			
			ctx.beginPath();
			ctx.moveTo(0, -10);
			ctx.lineTo(10, 10);
			ctx.lineTo(0, 5);
			ctx.lineTo(-10, 10);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			ctx.restore();
			
			// Рисуем орбы
			var orbCount = playerData.orbsCollected;
			var orbStartX = startX + 15;
			var orbSpacing = 8;
			
			for (var j = 0; j < orbCount && j < 10; j++) {
				ctx.save();
				ctx.translate(orbStartX + (j * orbSpacing), yPos);
				ctx.scale(orbScale, orbScale);
				ctx.fillStyle = '#ff6000';
				ctx.strokeStyle = '#ff9d4d';
				ctx.lineWidth = 1;
				
				ctx.beginPath();
				ctx.moveTo(-3, -1.5);
				ctx.lineTo(-1.5, -3);
				ctx.lineTo(1.5, -3);
				ctx.lineTo(3, -1.5);
				ctx.lineTo(3, 1.5);
				ctx.lineTo(1.5, 3);
				ctx.lineTo(-1.5, 3);
				ctx.lineTo(-3, 1.5);
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}
			
			// Если орбов > 10, показываем число
			if (orbCount > 10) {
				ctx.fillStyle = '#ffffff';
				ctx.font = '12px Arial';
				ctx.textAlign = 'left';
				ctx.fillText('x' + orbCount, orbStartX + (10 * orbSpacing), yPos + 4);
			}
		}
		
		ctx.restore();
		
		// Вызываем родительский tick
		IgeEntity.prototype.tick.call(this, ctx);
	}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = PlayerStatsUI; }

