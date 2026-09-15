// ---------- Global WebGL shader background ----------
(function initShader() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return;

    const vsSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

    const fsSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_mouse;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float amp = 0.5;
      for (int i = 0; i < 5; i++) {
        v += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
      vec2 mouseUV = (u_mouse - 0.5 * u_resolution.xy) / u_resolution.y;

      float dist = length(uv - mouseUV);
      float warp = smoothstep(0.7, 0.0, dist) * 0.55;
      vec2 dir = normalize(uv - mouseUV + 0.0001);
      vec2 wuv = uv + dir * warp * 0.18;

      // stretch vertically so features read as flowing curtains, like aurora
      vec2 auv = wuv * vec2(0.85, 2.3);

      float t = u_time * 0.045;
      float n = fbm(auv * 1.4 + vec2(t, -t * 0.6));
      float n2 = fbm(auv * 2.0 - vec2(t * 0.5, t * 0.35) + n * 0.6);
      float n3 = fbm(auv * 1.7 + vec2(-t * 0.4, t * 0.3) + n2 * 0.5);

      vec3 colorBase   = vec3(0.02, 0.022, 0.038);
      vec3 colorGreen  = vec3(0.05, 0.24, 0.17);
      vec3 colorBlue   = vec3(0.08, 0.15, 0.34);
      vec3 colorViolet = vec3(0.20, 0.12, 0.37);
      vec3 colorPink   = vec3(0.36, 0.11, 0.28);

      vec3 col = colorBase;
      col = mix(col, colorGreen, smoothstep(0.28, 0.55, n2) * 0.55);
      col = mix(col, colorBlue, smoothstep(0.42, 0.7, n3) * 0.65);
      col = mix(col, colorViolet, smoothstep(0.5, 0.8, n) * 0.85);
      col = mix(col, colorPink, smoothstep(0.42, 0.78, n2 * n3 + 0.2) * 0.85);

      float glow = smoothstep(0.4, 0.0, dist);
      col += vec3(0.14, 0.22, 0.30) * glow * 0.85;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    const vertexShader = compileShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('Program link error:', gl.getProgramInfoLog(program));
        return;
    }
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const mouseLoc = gl.getUniformLocation(program, 'u_mouse');

    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
        canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
        mouse.x = mouse.targetX = canvas.width / 2;
        mouse.y = mouse.targetY = canvas.height / 2;
    }

    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('mousemove', (e) => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        mouse.targetX = e.clientX * dpr;
        mouse.targetY = (window.innerHeight - e.clientY) * dpr;
    });

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startTime = performance.now();

    function render(now) {
        mouse.x += (mouse.targetX - mouse.x) * 0.08;
        mouse.y += (mouse.targetY - mouse.y) * 0.08;

        gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
        gl.uniform1f(timeLoc, (now - startTime) / 1000);
        gl.uniform2f(mouseLoc, mouse.x, mouse.y);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        if (!prefersReducedMotion) requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
})();

// ---------- Scroll-triggered reveals ----------
const revealTargets = document.querySelectorAll(
    '.section-title, .about-text, .about-facts, .timeline-item, .project, .skill-group'
);

const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });

revealTargets.forEach((el) => observer.observe(el));

// ---------- Scroll-spy nav ----------
const navLinks = document.querySelectorAll('.nav-links a');
const sections = document.querySelectorAll('.section');

const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            const id = entry.target.getAttribute('id');
            navLinks.forEach((link) => {
                link.classList.toggle('active', link.dataset.nav === id);
            });
        }
    });
}, { threshold: 0.5 });

sections.forEach((s) => spy.observe(s));

// ---------- Hide scroll hint once past the hero ----------
const scrollHint = document.getElementById('scroll-hint');
window.addEventListener('scroll', () => {
    scrollHint.classList.toggle('past-hero', window.scrollY > window.innerHeight * 0.6);
});

// ---------- Skill orbs: click to reveal (multi-select toggle) ----------
const skillOrbs = document.querySelectorAll('.skill-orb');
const skillPanels = document.querySelectorAll('.skills-panel-content');

function toggleSkill(category) {
    const orb = Array.from(skillOrbs).find((o) => o.dataset.target === category);
    const panel = Array.from(skillPanels).find((p) => p.dataset.category === category);
    if (!orb || !panel) return;

    const isActive = orb.classList.contains('active');
    if (isActive) {
        orb.classList.remove('active');
        panel.classList.remove('active');
    } else {
        orb.classList.add('active');
        panel.classList.remove('active');
        void panel.offsetWidth; // restart the reveal animation
        panel.classList.add('active');
    }
}

skillOrbs.forEach((orb) => {
    orb.addEventListener('click', () => toggleSkill(orb.dataset.target));
});

// ---------- Project card tilt ----------
const tiltCards = document.querySelectorAll('.project');

tiltCards.forEach((card) => {
    function onMove(e) {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const rotateY = Math.min(px, 0) * 20;
        card.style.transform = `translateY(-6px) perspective(900px) rotateY(${rotateY}deg)`;
    }
    function onLeave() {
        card.style.transform = '';
    }
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', onLeave);
});