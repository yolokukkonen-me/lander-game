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
				.id('orb_' + i)
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
	}
};

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = ServerTerrain; }

