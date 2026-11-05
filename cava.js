const COUNT = 40;
const cava = document.querySelector(".cava");

for (let i = 0; i < COUNT; i++) {
  const bar = document.createElement("span");
  bar.className = "bar";
  bar.style.setProperty("--i", i);
  cava.appendChild(bar);
}
