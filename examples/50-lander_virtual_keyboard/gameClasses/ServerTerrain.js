var ServerTerrain = {
	createTerrain: function () {
		var i,
			preVal,
			terrainPoly,
			landingPad,
			orb,
			fixtureArr;

		this.landingPads = [];
		this.landingPadPositions = [];
		this.orbPositions = [];
		this.terrain = [];
		this.orbIdCounter = 0; // Счетчик для уникальных ID орбов
		this.spawnQueue = []; // Очередь для постепенного спавна орбов

		// Create random terrain (only once on server)
		while (this.landingPadPositions.length < 1 || this.orbPositions.length < 3) {
			this.landingPadPositions = [];
			this.orbPositions = [];
			this.terrain = [];

			terrainPoly = new IgePoly2d();
			terrainPoly.addPoint(0, 20);

			for (i = 0; i < 40; i++) {
				preVal = Math.random() * 100;
				// Generate terrain at lower positions (Y 5-20 = pixels 100-400)
				this.terrain[i] = Math.floor(Math.random() * 15) + 5;

				if (preVal > 90 && i > 1) {
					// Platform must be below player spawn (Y > 100)
					if (this.terrain[i] * 20 > 100 && this.terrain[i] * 20 < 300) {
						this.terrain[i + 1] = this.terrain[i];
						this.landingPadPositions.push(
							[(i) * 4 * 20 + 40, (this.terrain[i] * 20) - 2, 0]
						);

						terrainPoly.addPoint(i * 4, this.terrain[i]);
						terrainPoly.addPoint((i + 1) * 4, this.terrain[i]);

						i++;
					}
				} else {
					terrainPoly.addPoint(i * 4, this.terrain[i]);

					if (preVal > 50) {
						if (this.terrain[i] * 20 > 150 && i > 2 && i < 39) {
							this.orbPositions.push(
								[(i) * 4 * 20, (this.terrain[i] * 20) - 20, 0]
							);
						}
					}
				}
			}

			terrainPoly.addPoint(i * 4, 20);
		}

		// Loop the landing pads and mount them to the scene
		// Landing pads are static, no need to stream - clients create them locally
		for (i = 0; i < this.landingPadPositions.length; i++) {
			landingPad = new LandingPad()
				.id('landingPad_' + i)
				.translateTo(this.landingPadPositions[i][0], this.landingPadPositions[i][1], 0)
				.mount(ige.server.scene1);

			this.landingPads.push(landingPad);
		}

		// Loop orb positions and mount them
		for (i = 0; i < this.orbPositions.length; i++) {
			orb = new Orb()
				.id('orb_' + this.orbIdCounter++)
				.translateTo(this.orbPositions[i][0], this.orbPositions[i][1], 0)
				.scoreValue(Math.floor(this.orbPositions[i][1] / 4))
				.streamMode(1) // Stream to clients
				.mount(ige.server.scene1)
				.setupPhysics(); // Setup physics after position is set
		}

		terrainPoly.multiply(20);
		this.terrainPoly = terrainPoly;

		// Clone the terrain and scale down to box2d level
		this.terrainTriangles = this.terrainPoly.clone();
		this.terrainTriangles.divide(ige.box2d._scaleRatio);

		// Turn the terrain into triangles (box2d only allows convex shapes)
		this.terrainTriangles = this.terrainTriangles.triangulate();

		// Loop the triangles and make fixtures for them
		fixtureArr = [];

		for (i = 0; i < this.terrainTriangles.length; i++) {
			fixtureArr.push({
				filter: {
					categoryBits: 0x0001,
					maskBits: 0xffff
				},
				shape: {
					type: 'polygon',
					data: this.terrainTriangles[i]
				}
			});
		}

		// Now create a box2d entity for terrain physics
		new IgeEntityBox2d()
			.id('terrain')
			.category('floor')
			.box2dBody({
				type: 'static',
				allowSleep: true,
				fixtures: fixtureArr
			});

		console.log('Server terrain created with ' + this.landingPadPositions.length + ' landing pads and ' + this.orbPositions.length + ' orbs');

		// Store terrain data for sending to new clients
		this.terrainData = {
			terrain: this.terrain,
			landingPadPositions: this.landingPadPositions,
			orbPositions: this.orbPositions
		};

		console.log('Terrain data stored and ready to send to clients');
	},

	/**
	 * Подсчитывает количество активных орбов на сцене
	 */
	countActiveOrbs: function () {
		var count = 0;
		if (ige.server.scene1 && ige.server.scene1._children) {
			var entities = ige.server.scene1._children;
			for (var i = 0; i < entities.length; i++) {
				if (entities[i] && entities[i]._classId === 'Orb') {
					count++;
				}
			}
		}
		return count;
	},

	/**
	 * Получает все существующие позиции орбов на сцене
	 */
	getExistingOrbPositions: function () {
		var positions = [];
		if (ige.server.scene1 && ige.server.scene1._children) {
			var entities = ige.server.scene1._children;
			for (var i = 0; i < entities.length; i++) {
				if (entities[i] && entities[i]._classId === 'Orb' && entities[i]._translate) {
					positions.push({
						x: entities[i]._translate.x,
						y: entities[i]._translate.y
					});
				}
			}
		}
		return positions;
	},

	/**
	 * Проверяет, находится ли позиция слишком близко к платформе
	 */
	isTooCloseToLandingPad: function (x, y) {
		// Радиус сенсора захвата орба из Player.js (строка 105): radius: 60
		// Это уже Box2D единицы (метры в Box2D системе координат)
		// В IGE: 1 Box2D метр = scaleRatio пикселей (обычно 40)
		// Значит 60 Box2D единиц нужно умножить на scaleRatio
		// НО в реальности это значение кажется слишком большим (2400px),
		// поэтому используем просто 60 как есть (возможно уже в условных пикселях)
		var ORB_PICKUP_RADIUS = 60; // Радиус сенсора захвата
		
		// Расстояние от платформы = радиус захвата × 1.5
		var MIN_DISTANCE_TO_PAD = ORB_PICKUP_RADIUS * 1.5; // = 90 пикселей
		
		for (var i = 0; i < this.landingPadPositions.length; i++) {
			var padX = this.landingPadPositions[i][0];
			var padY = this.landingPadPositions[i][1];
			
			var distX = x - padX;
			var distY = y - padY;
			var distance = Math.sqrt(distX * distX + distY * distY);
			
			if (distance < MIN_DISTANCE_TO_PAD) {
				return true;
			}
		}
		
		return false;
	},

	/**
	 * Проверяет, находится ли позиция слишком близко к существующим орбам
	 */
	isTooCloseToOtherOrbs: function (x, y, existingOrbs) {
		var MIN_DISTANCE_BETWEEN_ORBS = 80; // Минимальное расстояние между орбами
		
		for (var i = 0; i < existingOrbs.length; i++) {
			var distX = x - existingOrbs[i].x;
			var distY = y - existingOrbs[i].y;
			var distance = Math.sqrt(distX * distX + distY * distY);
			
			if (distance < MIN_DISTANCE_BETWEEN_ORBS) {
				return true;
			}
		}
		
		return false;
	},

	/**
	 * Находит максимальную высоту на карте
	 */
	getMaxTerrainHeight: function () {
		var maxHeight = 0;
		for (var i = 0; i < this.terrain.length; i++) {
			if (this.terrain[i] > maxHeight) {
				maxHeight = this.terrain[i];
			}
		}
		return maxHeight * 20; // Конвертируем в пиксели
	},

	/**
	 * Генерирует один орб в случайной позиции
	 */
	spawnSingleOrb: function () {
		if (!this.terrain || this.terrain.length === 0) {
			console.warn('Cannot spawn orb: terrain not initialized');
			return false;
		}

		// Получаем максимальную высоту карты
		var maxMapHeight = this.getMaxTerrainHeight();
		var maxSpawnHeight = maxMapHeight * 1.5;

		// Получаем существующие позиции орбов
		var existingOrbs = this.getExistingOrbPositions();

		var maxAttempts = 50; // Максимум попыток для одного орба

		for (var attempts = 0; attempts < maxAttempts; attempts++) {
			// Выбираем случайную позицию на местности
			// Избегаем краев (индексы 2-37 из 40)
			var terrainIndex = Math.floor(Math.random() * 35) + 2;
			var terrainHeight = this.terrain[terrainIndex];
			var terrainY = terrainHeight * 20;

			// Случайная высота над поверхностью (от 30 до 200 пикселей)
			// ВАЖНО: орб должен быть ВЫШЕ (меньше по Y) чем поверхность
			var heightAboveTerrain = Math.floor(Math.random() * 170) + 30;
			
			var orbX = terrainIndex * 4 * 20;
			var orbY = terrainY - heightAboveTerrain; // Вычитаем, чтобы орб был ВЫШЕ
			var orbZ = 0;

			// Проверяем ограничения
			// 1. Орб не должен быть выше максимальной высоты * 1.5
			if (orbY < (600 - maxSpawnHeight)) {
				continue;
			}

			// 2. Орб должен быть СТРОГО выше поверхности (orbY < terrainY)
			if (orbY >= terrainY - 10) {
				continue; // Орб слишком близко или внутри карты
			}

			// 3. Местность не должна быть слишком низкой
			if (terrainY < 150) {
				continue;
			}

			// 4. Орб не должен быть рядом с платформой
			if (this.isTooCloseToLandingPad(orbX, orbY)) {
				continue;
			}

			// 5. Орб не должен быть рядом с другими орбами
			if (this.isTooCloseToOtherOrbs(orbX, orbY, existingOrbs)) {
				continue;
			}

			// Все проверки пройдены - создаем орб
			var orb = new Orb()
				.id('orb_' + this.orbIdCounter++)
				.translateTo(orbX, orbY, orbZ)
				.scoreValue(Math.floor(orbY / 4))
				.streamMode(1) // Stream to clients
				.mount(ige.server.scene1)
				.setupPhysics(); // Setup physics after position is set

			// Сохраняем начальную позицию орба для расчета бонуса за расстояние
			orb.originalStart(new IgePoint3d(orbX, orbY, orbZ));

			console.log('Spawned orb #' + (this.orbIdCounter - 1) + ' at position: (' + orbX + ', ' + orbY + '), ' + heightAboveTerrain + 'px above terrain (terrainY: ' + terrainY + ')');
			return true;
		}

		console.warn('Could not find suitable position for orb after ' + maxAttempts + ' attempts');
		return false;
	},

	/**
	 * Генерирует новые орбы постепенно с задержкой
	 * @param {number} count - количество орбов для генерации
	 */
	spawnRandomOrbs: function (count) {
		if (!this.terrain || this.terrain.length === 0) {
			console.warn('Cannot spawn orbs: terrain not initialized');
			return;
		}

		console.log('Starting gradual spawn of ' + count + ' new orbs (1 per second)...');

		// Инициализируем очередь спавна если её нет
		if (!this.spawnQueue) {
			this.spawnQueue = [];
		}

		// Добавляем орбы в очередь
		for (var i = 0; i < count; i++) {
			this.spawnQueue.push({
				spawnTime: ige._currentTime + (i * 1000) // Задержка 1 секунда между орбами
			});
		}
	},

	/**
	 * Обрабатывает очередь спавна орбов
	 */
	processSpawnQueue: function () {
		if (!this.spawnQueue || this.spawnQueue.length === 0) {
			return;
		}

		var currentTime = ige._currentTime;

		// Проверяем первый элемент в очереди
		if (this.spawnQueue[0].spawnTime <= currentTime) {
			// Время пришло - создаем орб
			var spawned = this.spawnSingleOrb();
			
			// Удаляем из очереди независимо от успеха
			this.spawnQueue.shift();
			
			if (this.spawnQueue.length > 0) {
				console.log('Orbs remaining in spawn queue: ' + this.spawnQueue.length);
			}
		}
	},

	/**
	 * Проверяет количество орбов и генерирует новые, если нужно
	 */
	checkAndSpawnOrbs: function () {
		var activeOrbs = this.countActiveOrbs();
		
		// Если орбов меньше 10, генерируем еще 10
		if (activeOrbs < 10) {
			console.log('Only ' + activeOrbs + ' orbs remaining. Spawning 10 more...');
			this.spawnRandomOrbs(10);
		}
	}
};

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = ServerTerrain; }

