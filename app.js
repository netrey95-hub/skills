

const TOTAL_UNITS = 1000; // 100.0% (шаг 0.1%)
const STORAGE_KEY = "bu_points_v1";
const STORAGE_LAST = "bu_last_v1";

const skills = [
  { key: "hit",   name: "Сила удара",                         emoji: "⚔️" },
  { key: "energy",name: "Количество энергии",                 emoji: "🛡️" },
  { key: "regen", name: "Скорость восстановления энергии",    emoji: "🛡️" },
  { key: "cw",    name: "Скорость вращения стрелки",          emoji: "💨" },
  { key: "ccw",   name: "Скорость движения против стрелки",   emoji: "💨" },
];

const groups = {
  speed:   { name: "Скорость", indices: [3,4] }, // cw, ccw
  defense: { name: "Защита",   indices: [1,2] }, // energy, regen
  attack:  { name: "Нападение",indices: [0]   }, // hit
};

const costs = {
  normal: 4000,
  balance: 6000,
  bias_medium: 5500,
  bias_big: 8500,
};

function minForBias(type, groupKey){
  // Большой: speed/defense >=70, attack >=40
  // Средний: speed/defense >=40, attack >=25
  const isBig = (type === "bias_big");
  if (groupKey === "attack") return isBig ? 400 : 250;
  return isBig ? 700 : 400;
}



function randIntInclusive(min, max){
  // [min..max]
  const range = max - min + 1;
  if (range <= 0) throw new Error("Bad randInt range");

  // crypto.getRandomValues -> unbiased via rejection sampling
  const cryptoObj = window.crypto || window.msCrypto;
  if (!cryptoObj || !cryptoObj.getRandomValues) {
    // fallback
    return min + Math.floor(Math.random() * range);
  }

  const maxUint32 = 0xFFFFFFFF;
  const limit = Math.floor((maxUint32 + 1) / range) * range; // largest multiple of range
  const buf = new Uint32Array(1);

  while (true){
    cryptoObj.getRandomValues(buf);
    const x = buf[0];
    if (x < limit) return min + (x % range);
  }
}



// Равномерная композиция: sum parts = total (целые), части >=0
function randomComposition(total, parts){
  if (parts === 1) return [total];
  const cuts = [];
  for (let i = 0; i < parts - 1; i++){
    cuts.push(randIntInclusive(0, total));
  }
  cuts.sort((a,b)=>a-b);

  const res = [];
  let prev = 0;
  for (const c of cuts){
    res.push(c - prev);
    prev = c;
  }
  res.push(total - prev);
  return res;
}

// Ограниченная композиция: sum = total, каждый в [min..max]
function randomBounded(total, parts, min, max){
  const cap = max - min;
  if (min * parts > total) throw new Error("Impossible bounds: min too high");
  if (max * parts < total) throw new Error("Impossible bounds: max too low");

  // Начинаем с min на каждого
  const res = new Array(parts).fill(min);
  let remaining = total - min * parts;

  for (let i = 0; i < parts; i++){
    const slotsLeft = parts - i - 1;

    // сколько максимум можно распределить в оставшиеся слоты
    const maxRemainingPossible = slotsLeft * cap;

    // add_i должен быть таким, чтобы оставшееся можно было уложить в slotsLeft * cap
    const lower = Math.max(0, remaining - maxRemainingPossible);
    const upper = Math.min(cap, remaining);

    const add = (i === parts - 1)
      ? remaining
      : randIntInclusive(lower, upper);

    res[i] += add;
    remaining -= add;
  }

  return res;
}

// Уклон: сначала minUnits в группу (между её навыками),
// затем остаток по всем 5 навыкам
function generateBias(type, groupKey){
  const group = groups[groupKey];
  const minUnits = minForBias(type, groupKey);
  const remaining = TOTAL_UNITS - minUnits;

  const result = new Array(skills.length).fill(0);

  // A) распределяем minUnits только внутри группы
  const groupParts = randomComposition(minUnits, group.indices.length);
  group.indices.forEach((idx, i) => {
    result[idx] += groupParts[i];
  });

  // B) распределяем remaining по всем 5 навыкам
  const restParts = randomComposition(remaining, skills.length);
  restParts.forEach((v, i) => result[i] += v);

  return result;
}

// Обычная
function generateNormal(){
  return randomComposition(TOTAL_UNITS, skills.length);
}

// Баланс (каждый 15–40%)
function generateBalance(){
  return randomBounded(TOTAL_UNITS, skills.length, 150, 400);
}



const elPoints   = document.getElementById("points");
const elClickBtn = document.getElementById("clickBtn");
const elGenType  = document.getElementById("genType");
const elGroupBox = document.getElementById("groupBox");
const elGroupHint= document.getElementById("groupHint");
const elCostHint = document.getElementById("costHint");
const elRollBtn  = document.getElementById("rollBtn");
const elResult   = document.getElementById("result");
const elSumCheck = document.getElementById("sumCheck");
const elResetBtn = document.getElementById("resetBtn");

let points = loadPoints();
let selectedGroup = "speed"; // по умолчанию

function loadPoints(){
  const v = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
  return Number.isFinite(v) ? v : 0;
}
function savePoints(){
  localStorage.setItem(STORAGE_KEY, String(points));
}

function unitsToPercent(units){
  return (units / 10).toFixed(1);
}

function updateUI(){
  elPoints.textContent = points.toLocaleString("ru-RU");

  const type = elGenType.value;
  const cost = costs[type];
  elCostHint.textContent = `Стоимость: ${cost.toLocaleString("ru-RU")} БУ`;

  const isBias = (type === "bias_medium" || type === "bias_big");
  elGroupBox.style.display = isBias ? "block" : "none";

  if (isBias){
    const minUnits = minForBias(type, selectedGroup);
    const minPct = unitsToPercent(minUnits);
    elGroupHint.textContent =
      `Минимум для группы “${groups[selectedGroup].name}”: ${minPct}% (остальное ${unitsToPercent(TOTAL_UNITS - minUnits)}% распределится случайно по всем навыкам).`;
  } else {
    elGroupHint.textContent = "";
  }

  elRollBtn.disabled = points < cost;
  elRollBtn.textContent = points < cost ? "Не хватает БУ" : "Сгенерировать";
}

function renderResult(dist){
  const lines = skills.map((s, i) => {
    return `${s.emoji} ${s.name}: ${unitsToPercent(dist[i])}%`;
  });

  const sum = dist.reduce((a,b)=>a+b,0);
  elResult.classList.remove("muted");
  elResult.textContent = lines.join("\n\n");
  elSumCheck.textContent = `Сумма: ${unitsToPercent(sum)}%`;

  localStorage.setItem(STORAGE_LAST, JSON.stringify(dist));
}

function restoreLast(){
  const raw = localStorage.getItem(STORAGE_LAST);
  if (!raw) return;
  try {
    const dist = JSON.parse(raw);
    if (Array.isArray(dist) && dist.length === skills.length){
      renderResult(dist);
    }
  } catch {}
}



elClickBtn.addEventListener("click", () => {
  points += 250;
  savePoints();
  updateUI();
});

elGenType.addEventListener("change", () => {
  updateUI();
});

document.querySelectorAll(".seg").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedGroup = btn.dataset.group;

    document.querySelectorAll(".seg").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    updateUI();
  });
});

// активируем дефолтную кнопку группы
document.querySelector(`.seg[data-group="${selectedGroup}"]`)?.classList.add("active");

elRollBtn.addEventListener("click", () => {
  const type = elGenType.value;
  const cost = costs[type];
  if (points < cost) return;

  let dist;
  if (type === "normal") {
    dist = generateNormal();
  } else if (type === "balance") {
    dist = generateBalance();
  } else if (type === "bias_medium" || type === "bias_big") {
    dist = generateBias(type, selectedGroup);
  } else {
    dist = generateNormal();
  }

  points -= cost;
  savePoints();
  renderResult(dist);
  updateUI();
});

elResetBtn.addEventListener("click", () => {
  points = 0;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_LAST);
  elResult.textContent = "Пока пусто. Накликай БУ и нажми “Сгенерировать”.";
  elResult.classList.add("muted");
  elSumCheck.textContent = "";
  updateUI();
});

// init
restoreLast();
updateUI();