var ClientTerrain = {
	createTerrain: function () {
		var i,
			terrainPoly,
			fixtureArr;

		// Check if we have terrain data from server
		if (!this.terrainData) {
			return;
		}

		// Use data from server instead of generating random terrain
		this.terrain = this.terrainData.terrain;
		this.landingPadPositions = this.terrainData.landingPadPositions;
		this.orbPositions = this.terrainData.orbPositions;
		this.landingPads = [];

		// Build terrain polygon from data
		terrainPoly = new IgePoly2d();
		terrainPoly.addPoint(0, 20);

	var pointAdded = 0;
	for (i = 0; i < this.terrain.length; i++) {
		// КРИТИЧНО: Используем ИНДЕКСЫ от сервера вместо обратного вычисления
		// Это гарантирует 100% совпадение terrain polygon между сервером и клиентом
		var isLandingPad = false;
		if (this.terrainData.landingPadIndices) {
			// Проверяем по индексу (точное совпадение с сервером)
			isLandingPad = this.terrainData.landingPadIndices.indexOf(i) !== -1;
		}
		
		if (isLandingPad) {
			// Add both points for flat landing pad (ТОЧНО как на сервере)
			terrainPoly.addPoint(i * 4, this.terrain[i]);
			terrainPoly.addPoint((i + 1) * 4, this.terrain[i]);
			i++; // Skip next point (ТОЧНО как на сервере)
		} else {
			terrainPoly.addPoint(i * 4, this.terrain[i]);
		}
	}

	// КРИТИЧНО: Используем фиксированное значение вместо i (которое может отличаться из-за i++)
	terrainPoly.addPoint(40 * 4, 20);

		// Create landing pads from server data (client-side rendering only, no physics)
		for (i = 0; i < this.landingPadPositions.length; i++) {
			var landingPad = new LandingPad()
				.translateTo(this.landingPadPositions[i][0], this.landingPadPositions[i][1], 0)
				.mount(ige.client.objectScene);

			this.landingPads.push(landingPad);
		}

	// Orbs are created on server and streamed to clients (not created here)

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

		// Now create a box2d entity
		new IgeEntityBox2d()
			.category('floor')
			.box2dBody({
				type: 'static',
				allowSleep: true,
				fixtures: fixtureArr
			});

		// Create the entity that will render the terrain
		var TerrainEntity = IgeEntity.extend({
			classId: 'TerrainEntity',
			tick: function (ctx) {
				IgeEntity.prototype.tick.call(this, ctx);
				ctx.strokeStyle = '#ffffff';
				ige.client.terrainPoly.render(ctx);
			}
		});

		new TerrainEntity()
			.mount(ige.client.mainScene);
	}
};