var LandingPad = IgeEntityBox2d.extend({
	classId: 'LandingPad',

	init: function () {
		IgeEntityBox2d.prototype.init.call(this);

		// Set the rectangle colour (this is read in the Rectangle.js smart texture)
		this._rectColor = '#ffc600';

		this.category('landingPad')
			.width(80)
			.height(5);

		// Set texture only on client side
		if (ige.isClient) {
			this.texture(ige.client.textures.rectangle);
		}

		this.box2dBody({
			type: 'static',
			allowSleep: true,
			fixtures: [{
				filter: {
					categoryBits: 0x0002,
					maskBits: 0xffff
				},
				shape: {
					type: 'rectangle'
				}
			}]
		});
	}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = LandingPad; }