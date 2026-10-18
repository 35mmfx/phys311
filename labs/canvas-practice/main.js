// Find the canvas and get its drawing tool ("context")
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

const picture = new Image();
const photoCanvas = document.createElement("canvas");
const photoCtx = photoCanvas.getContext("2d");
const photoWidth = 420;
let photoHeight = 130;
let photoReady = false;
const columns = 5;
const rows = 4;
const photo = { x: (canvas.width - photoWidth) / 2, y: 40, vx: 125, vy: 0 };
let scatterTime = 1;
const scatterDuration = 0.7;
const gravity = 520;
const bounceStrength = 0.78;

picture.onload = () => {
  photoHeight = photoWidth * picture.height / picture.width;
  photoCanvas.width = photoWidth;
  photoCanvas.height = photoHeight;
  photoCtx.filter = "grayscale(100%)";
  photoCtx.drawImage(picture, 0, 0, photoWidth, photoHeight);
  photoCtx.filter = "none";

  const squareSize = photoWidth * (160 / 430);
  photoCtx.fillStyle = "rgba(255, 0, 0, 0.45)";
  photoCtx.fillRect(
    (photoWidth - squareSize) / 2,
    (photoHeight - squareSize) / 2,
    squareSize,
    squareSize
  );
  photoReady = true;
};

picture.onerror = () => {
  console.error("Could not load photo.jpg for the bouncing photo animation.");
};
picture.src = "photo.jpg";

function drawPhoto() {
  const separation = Math.sin(Math.min(scatterTime / scatterDuration, 1) * Math.PI);
  const tileWidth = photoWidth / columns;
  const tileHeight = photoHeight / rows;
  const sourceTileWidth = photoCanvas.width / columns;
  const sourceTileHeight = photoCanvas.height / rows;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const centerX = (column + 0.5) / columns * 2 - 1;
      const centerY = (row + 0.5) / rows * 2 - 1;
      const length = Math.hypot(centerX, centerY) || 1;
      const offsetX = centerX / length * 220 * separation;
      const offsetY = centerY / length * 220 * separation;
      const gap = 4 * separation;

      ctx.drawImage(
        photoCanvas,
        column * sourceTileWidth,
        row * sourceTileHeight,
        sourceTileWidth,
        sourceTileHeight,
        photo.x + column * tileWidth + offsetX + gap / 2,
        photo.y + row * tileHeight + offsetY + gap / 2,
        tileWidth - gap,
        tileHeight - gap
      );
    }
  }
  ctx.restore();
}

// The photo bounces around the canvas and briefly separates into tiles on impact.
let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  photo.x += photo.vx * dt;
  photo.vy += gravity * dt;
  photo.y += photo.vy * dt;
  scatterTime += dt;

  if (photo.x < 0 || photo.x + photoWidth > canvas.width) {
    photo.x = Math.max(0, Math.min(photo.x, canvas.width - photoWidth));
    photo.vx = -photo.vx;
  }

  const floor = canvas.height - photoHeight;
  if (photo.y >= floor && photo.vy > 0) {
    photo.y = floor;
    photo.vy = -Math.max(Math.abs(photo.vy) * bounceStrength, 260);
    scatterTime = 0;
  }

  drawBackground();
  if (photoReady) {
    drawPhoto();
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);