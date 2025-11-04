var ClientWorld = {
	createWorld: function () {
		// Create the scene
		this.mainScene = new IgeScene2d()
			.id('mainScene');

		// Use scene1 to match server-side scene name (important for network streaming)
		this.objectScene = new IgeScene2d()
			.id('scene1')
			.mount(this.mainScene);
		
		// Also store as scene1 for compatibility
		this.scene1 = this.objectScene;

		this.uiScene = new IgeScene2d()
			.id('uiScene')
			.ignoreCamera(true)
			.mount(this.mainScene);

		// Create UI elements
		new IgeFontEntity()
			.texture(ige.client.textures.font)
			.width(100)
			.text('Score')
			.top(5)
			.right(10)
			.mount(this.uiScene);

		new IgeFontEntity()
			.id('scoreText')
			.texture(ige.client.textures.font)
			.width(100)
			.text('0 points')
			.colorOverlay('#ff6000')
			.top(35)
			.right(10)
			.mount(this.uiScene);
		
		// Uncollected orbs counter
		new IgeFontEntity()
			.id('orbsUncollected')
			.texture(ige.client.textures.font)
			.width(100)
			.height(40)
			.textAlignX(0)
			.textAlignY(0)
			.nativeFont('11px Arial')
			.nativeStroke(0)
			.text('')
			.colorOverlay('#ffc700')
			.top(0)
			.left(0)
			.mount(this.uiScene);
		
	// Orb stats - create separate text entities for each player slot
	for (var i = 0; i < 4; i++) {
		new IgeFontEntity()
			.id('orbStatsP' + (i + 1))
			.texture(ige.client.textures.font)
			.width(100)
			.height(40)
			.textAlignX(0)
			.textAlignY(0)
			.nativeFont('11px Arial')
			.nativeStroke(0)
			.text('')
			.top(22 + (i * 12))
			.left(0)
			.mount(this.uiScene);
	}
	
	// Logging indicator - показывается когда активно логирование
	new IgeFontEntity()
		.id('loggingIndicator')
		.texture(ige.client.textures.font)
		.width(100)
		.height(40)
		.textAlignX(0)
		.textAlignY(0)
		.nativeFont('11px Arial')
		.nativeStroke(0)
		.text('')
		.colorOverlay('#ffffff')  // Белый цвет
		.top(70)  // Под статистикой игроков (22 + 4*12 = 70)
		.left(0)
		.mount(this.uiScene);

		new IgeFontEntity()
			.texture(ige.client.textures.font)
			.width(100)
			.text('Fuel Level')
			.top(80)
			.right(10)
			.mount(this.uiScene);

		// Define the player fuel bar
		new IgeUiProgressBar()
			.id('player_fuelBar')
			.max(100)
			.min(0)
			.right(10)
			.top(120)
			//.translateTo(0, -25, 0)
			.width(100)
			.height(10)
			.barBackColor('#953800')
			.barColor('#ff6000')
			.mount(ige.client.uiScene);

		// Create the main viewport and set the scene
		// it will "look" at as the new scene1 we just
		// created above
		this.vp1 = new IgeViewport()
			.addComponent(IgeMouseZoomComponent) // Вернули zoom
			.mouseZoom.enabled(true) // Включен zoom
			.id('vp1')
			.autoSize(true)
			.scene(this.mainScene)
			.drawBounds(false)
			.drawBoundsData(false) // БЕЗ надписи "vp 1 x y"
			.drawMouse(false) // БЕЗ фиолетового квадрата (курсора)
			.mount(ige);
		
		// Устанавливаем начальный зум камеры (0.75 = уменьшение на 25%, показывает больше игрового мира)
		this.vp1.camera.scaleTo(0.75, 0.75, 0.75);

		// Update orb stats for each player with individual colors
		ige.addBehaviour('updateOrbStatsPerPlayer', function () {
			if (!ige.client || !ige.client.objectScene) { return; }

			var sceneChildren = ige.client.objectScene._children;
			if (!sceneChildren || !sceneChildren.length) {
				// Hide all player stats
				for (var i = 0; i < 4; i++) {
					var statsEnt = ige.$('orbStatsP' + (i + 1));
					if (statsEnt) statsEnt.text('');
				}
				var uncollectedEnt = ige.$('orbsUncollected');
				if (uncollectedEnt) uncollectedEnt.text('');
				return;
			}

			var playerList = [];
			var totalOrbsOnScene = 0;
			
			// Границы карты: X от 0 до 3200 (40 блоков * 80 пикселей), Y от -200 до 800
			var MAP_MIN_X = -500;
			var MAP_MAX_X = 3700;
			var MAP_MIN_Y = -500;
			var MAP_MAX_Y = 1000;
			
			for (var i = 0; i < sceneChildren.length; i++) {
				var entity = sceneChildren[i];
				if (entity && entity._classId === 'Player') {
					playerList.push({ 
						slotNumber: entity._playerNumber || 0, 
						orbsCollected: entity._orbsCollected || 0,
						shipColor: entity._shipColor || '#ffffff'
					});
				}
				if (entity && entity._classId === 'Orb') {
					// Считаем только валидные орбы:
					// 1. Не помечены как мертвые
					// 2. Имеют позицию
					// 3. Находятся в пределах карты
					if (entity._alive !== false && entity._translate) {
						var x = entity._translate.x;
						var y = entity._translate.y;
						
						if (x >= MAP_MIN_X && x <= MAP_MAX_X && y >= MAP_MIN_Y && y <= MAP_MAX_Y) {
							totalOrbsOnScene++;
						}
					}
				}
			}
			
			// Update uncollected orbs counter (все орбы, что еще на карте)
			var uncollectedEnt = ige.$('orbsUncollected');
			if (uncollectedEnt) {
				uncollectedEnt.text('● ' + totalOrbsOnScene);
			}

			playerList.sort(function (a, b) { return a.slotNumber - b.slotNumber; });

		// Update each player's stat entity
		for (var j = 0; j < 4; j++) {
			var statsEnt = ige.$('orbStatsP' + (j + 1));
			if (!statsEnt) continue;

			if (j < playerList.length) {
				var p = playerList[j];
				statsEnt.text('▲ ' + p.orbsCollected);
				
				// Convert rgba to hex if needed
				var color = p.shipColor;
				if (/^rgba?\(/i.test(color)) {
					try {
						var m = color.match(/rgba?\(([^)]+)\)/i);
						if (m && m[1]) {
							var parts = m[1].split(',').map(function(v) { return parseFloat(v.trim()); });
							var r = Math.round(parts[0] || 255);
							var g = Math.round(parts[1] || 255);
							var b = Math.round(parts[2] || 255);
							color = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
						}
					} catch (e) {}
				}
				statsEnt.colorOverlay(color);
			} else {
				statsEnt.text('');
			}
		}
	});
	
	// Update logging indicator for local player
	ige.addBehaviour('updateLoggingIndicator', function () {
		var loggingEnt = ige.$('loggingIndicator');
		if (!loggingEnt) return;
		
		// Показываем индикатор только для локального игрока
		if (ige.client && ige.client.player) {
			var player = ige.client.player;
			
			// Показываем состояние ВСЕЙ системы логирования
			// Если система выключена - показываем "OFF"
			// Если система включена и активно логирует - показываем "LOGGING"
			// Если система включена но не логирует (между эпизодами) - ничего не показываем
			
			var loggingEnabled = player._loggingEnabled !== undefined ? player._loggingEnabled : true;
			var loggingActive = player._playerLogging || false;
			
			if (!loggingEnabled) {
				loggingEnt.text('● LOGGING OFF');
				loggingEnt.colorOverlay('#ff0000'); // Красный когда выключено
			} else if (loggingActive) {
				loggingEnt.text('● LOGGING');
				loggingEnt.colorOverlay('#ffffff'); // Белый когда активно
			} else {
				loggingEnt.text(''); // Пусто когда включено но не активно
			}
		} else {
			loggingEnt.text('');
		}
	});
	}
};