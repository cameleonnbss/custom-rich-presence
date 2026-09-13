// Ambient floating particles on a fixed canvas. Extremely light:
// ~40 dots, one rAF loop, no shadows or glows.

export function startParticles(count: number): void {
  const canvas = document.getElementById("particles") as HTMLCanvasElement | null;
  if (!canvas || count <= 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let w = 0;
  let h = 0;
  const resize = (): void => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize);

  const dots = Array.from({ length: Math.min(count, 120) }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.6 + Math.random() * 1.6,
    vx: (Math.random() - 0.5) * 0.00022,
    vy: (Math.random() - 0.5) * 0.00022,
    a: 0.05 + Math.random() * 0.16
  }));

  const tick = (): void => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    for (const d of dots) {
      d.x += d.vx;
      d.y += d.vy;
      if (d.x < 0 || d.x > 1) d.vx *= -1;
      if (d.y < 0 || d.y > 1) d.vy *= -1;
      ctx.globalAlpha = d.a;
      ctx.beginPath();
      ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
