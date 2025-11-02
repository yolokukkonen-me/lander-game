var image = {
	render: function (ctx, entity) {
		// Draw the player entity
		ctx.fillStyle = '#ff6000'; // Оранжевый как у очков
		ctx.strokeStyle = '#ff9d4d'; // Светло-оранжевый для обводки
		ctx.beginPath();
		ctx.moveTo(-entity._bounds2d.x2, -entity._bounds2d.y2 / 2);
		ctx.lineTo(-entity._bounds2d.x2 / 2, -entity._bounds2d.y2);
		ctx.lineTo(entity._bounds2d.x2 / 2, -entity._bounds2d.y2);
		ctx.lineTo(entity._bounds2d.x2, -entity._bounds2d.y2 / 2);
		ctx.lineTo(entity._bounds2d.x2, entity._bounds2d.y2 / 2);
		ctx.lineTo(entity._bounds2d.x2 / 2, entity._bounds2d.y2);
		ctx.lineTo(-entity._bounds2d.x2 / 2, entity._bounds2d.y2);
		ctx.lineTo(-entity._bounds2d.x2, entity._bounds2d.y2 / 2);
		ctx.lineTo(-entity._bounds2d.x2, -entity._bounds2d.y2 / 2);
		ctx.fill();
		ctx.stroke();
	}
};