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
			// Check if this is a landing pad position
			var isLandingPad = false;
			for (var j = 0; j < this.landingPadPositions.length; j++) {
				var padX = this.landingPadPositions[j][0];
				var expectedI = (padX - 40) / (4 * 20);
				if (Math.abs(i - expectedI) < 0.5) {
					isLandingPad = true;
					// Add both points for flat landing pad
					terrainPoly.addPoint(i * 4, this.terrain[i]);
					if (i + 1 < this.terrain.length) {
						terrainPoly.addPoint((i + 1) * 4, this.terrain[i]);
						i++; // Skip next point
					}
					break;
				}
			}
			
			if (!isLandingPad) {
				terrainPoly.addPoint(i * 4, this.terrain[i]);
			}
		}

		terrainPoly.addPoint(i * 4, 20);

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