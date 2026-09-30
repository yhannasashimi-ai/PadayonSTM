const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let S = { taskStack: [], historyStack: [] }; 
let focus = false, formTags = [];
let token = localStorage.padToken || '', email = localStorage.padEmail || '';

async function api(path, opt = {}) {
  opt.headers = { ...opt.headers, Authorization: 'Bearer ' + token };
  const r = await fetch(path, opt);
  if (r.status === 401) { logout(); throw new Error('expired'); }
  return r;
}
let mode = 'login';
function setMode(m) {
  mode = m;
  $('#tabLogin').classList.toggle('primary', m === 'login');
  $('#tabSignup').classList.toggle('primary', m === 'signup');
  $('#authBtn').textContent = m === 'login' ? 'Log in' : 'Sign up';
  $('#aPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#loginErr').textContent = '';
}
$('#tabLogin').onclick = () => setMode('login');
$('#tabSignup').onclick = () => setMode('signup');
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  let r;
  try {
    r = await fetch('/api/' + mode, { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'email=' + encodeURIComponent($('#aEmail').value.trim()) + '&password=' + encodeURIComponent($('#aPass').value) 
    });
  } catch {
    $('#loginErr').textContent = "Can't reach the server. Start it with 'java Server.java' and open http://localhost:8080";
    return;
  }
  if (!r.ok) { $('#loginErr').textContent = await r.text(); return; }
  const d = await r.json();
  token = d.token; email = d.email;
  localStorage.padToken = token; localStorage.padEmail = email;
  $('#aPass').value = '';
  enter();
});
window.onload = () => { if (token) enter(); };
async function enter() {
  try { S = await (await api('/api/state')).json(); } catch { return; }
  $('#login').hidden = true; $('#app').hidden = false;
  $('#who').textContent = 'Signed in as ' + email;
  render();
}
function logout() {
  localStorage.removeItem('padToken'); localStorage.removeItem('padEmail');
  token = ''; $('#app').hidden = true; $('#login').hidden = false;
}
const save = () => api('/api/state', { method: 'POST', body: JSON.stringify(S) }).catch(() => {});

function addTask(task) { S.taskStack.push(task); save(); render(true); }         
function completeTask() {                                                       
  const t = S.taskStack.pop();
  if (!t) return;
  S.historyStack.push(t); save(); render(); sparkle();
}
function peekTask() {                                                        
  const t = S.taskStack.at(-1);
  if (!t) return;
  $('#dlgBody').innerHTML = `<h2>${esc(t.title)}</h2><p>${esc(t.description || 'No description')}</p>` +
    `<p>${tagsHtml(t)}</p><p class="note"> ${t.deadline ? new Date(t.deadline).toLocaleString() : 'No deadline'}` +
    ` · ${t.mins ? t.mins + ' min' : 'No estimate'}<br>Created ${new Date(t.createdAt).toLocaleString()}</p>`;
  $('#dlg').showModal();
}
function undoTask() {                                                           
  const t = S.historyStack.pop();
  if (!t) return;
  S.taskStack.push(t); save(); render(true);
}
function toggleFocusMode(on) { focus = on; render(); }

const tagsHtml = t => t.tags.map(g => `<span class="pill">${esc(g)}</span>`).join('');
function render(animate) {
  const top = S.taskStack.at(-1);
  $('#app').classList.toggle('focus', focus);
  $('#focusToggle').checked = focus;
  $('#fs').disabled = focus;
  $('#focusNote').hidden = !focus;
  $('#focusCard').innerHTML = top
    ? `<span class="badge"> Do this first</span><h2>${esc(top.title)}</h2>` +
      `<p>${esc(top.description || '')}</p><p>${tagsHtml(top)}</p>` +
      `<p class="note">${top.deadline ? new Date(top.deadline).toLocaleString() : ''} ${top.mins ? top.mins + ' min' : ''}</p>` +
      `<div class="row" style="justify-content:center"><button class="btn primary" id="doneBtn">Done</button><button class="btn" id="peekBtn">Peek</button></div>`
    : `<div class="empty"></div><h2>All done!</h2><p>Nothing left to do. Time to rest or add a new task.</p>`;
  if (animate) $('#focusCard').classList.add('slide');
  else $('#focusCard').classList.remove('slide');
  if (top) { $('#doneBtn').onclick = completeTask; $('#peekBtn').onclick = peekTask; }
  $('#list').innerHTML = S.taskStack.slice(0, -1).reverse()
    .map(t => `<li> ${esc(t.title)} ${tagsHtml(t)}</li>`).join('') || '<li>Nothing waiting. </li>';
  $('#hlist').innerHTML = S.historyStack.slice().reverse()
    .map(t => `<li> ${esc(t.title)}</li>`).join('') || '<li>No completed tasks yet.</li>';
  $('#hCount').textContent = S.historyStack.length;
  $('#undoBtn').disabled = !S.historyStack.length;
}
function sparkle() {
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    s.className = 'spark'; s.textContent = ['✨', '🎉', '🌟', '💛'][i % 4];
    s.style.left = 20 + Math.random() * 60 + 'vw'; s.style.top = 40 + Math.random() * 30 + 'vh';
    document.body.appendChild(s); setTimeout(() => s.remove(), 1200);
  }
}

function renderPills() {
  $('#pills').innerHTML = formTags.map((g, i) =>
    `<span class="pill">${esc(g)} <button type="button" data-i="${i}" aria-label="Remove tag ${esc(g)}">×</button></span>`).join('');
  $('#pills').querySelectorAll('button').forEach(b => b.onclick = () => { formTags.splice(b.dataset.i, 1); renderPills(); });
}
function commitTag() {
  const v = $('#tagIn').value.trim().replace(/,$/, '');
  if (!v) return true;
  if (formTags.length >= 3) { $('#err').textContent = 'Only 3 tags per task. 🌸'; return false; }
  formTags.push(v.slice(0, 25)); $('#tagIn').value = ''; $('#tagCount').textContent = '0/25';
  $('#err').textContent = ''; renderPills(); return true;
}
$('#tagIn').addEventListener('input', e => $('#tagCount').textContent = e.target.value.length + '/25');
$('#tagIn').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTag(); } });

$('#form').addEventListener('submit', e => {
  e.preventDefault();
  if (focus) return;
  const title = $('#title').value.trim();
  if (!title) { $('#err').textContent = 'Please give your task a title. 🌼'; $('#title').focus(); return; }
  if (!commitTag()) return;
  addTask({
    id: Date.now(), title, description: $('#desc').value.trim(), tags: formTags.slice(),
    deadline: $('#deadline').value, mins: $('#mins').value, createdAt: new Date().toISOString()
  });
  e.target.reset(); formTags = []; renderPills(); $('#err').textContent = ''; $('#tagCount').textContent = '0/25';
});
$('#undoBtn').onclick = undoTask;
$('#focusToggle').onchange = e => toggleFocusMode(e.target.checked);
$('#logoutBtn').onclick = logout;
$('#dlgClose').onclick = () => $('#dlg').close();
$('#themeBtn').onclick = () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = dark ? '' : 'dark';
  $('#themeBtn').textContent = dark ? '🌙 Night' : '☀️ Day';
};