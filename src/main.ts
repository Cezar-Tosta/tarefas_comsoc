import { bindEvents, boot, render, watchAuth } from "./app";
import { loadPrefs } from "./state";
// oxlint-disable-next-line import/no-unassigned-import -- efeito colateral: injeta o CSS
import "./style.css";

loadPrefs();
bindEvents();
render();
void boot().then(watchAuth);
