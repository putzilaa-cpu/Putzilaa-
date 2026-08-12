const $=s=>document.querySelector(s);
let state={user:null,categories:[]};

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function msg(text,cls="notice"){return `<div class="${cls}">${esc(text)}</div>`}
function bytes(n){n=Number(n||0);const u=["B","KB","MB","GB","TB"];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?2:0)} ${u[i]}`}
function date(v){return new Date(v+"Z").toLocaleString("pt-BR")}

async function api(url,opt={}){const r=await fetch(url,{credentials:"same-origin",...opt});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Erro");return data}

async function init(){
  state.categories=await api("/api/categories");
  await refreshMe(); renderCategories(); await loadPosts();
  document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>page(b.dataset.page));
  $("#clock").textContent=new Date().toLocaleString("pt-BR");
}
async function refreshMe(){state.user=(await api("/api/auth/me")).user;$("#session").innerHTML=state.user?`LOGADO: <b>${esc(state.user.username)}</b><br>PERFIL: ${state.user.role}<br><button onclick="logout()">[ SAIR ]</button>`:"VISITANTE<br><br>Faça login para postar."}
function renderCategories(){
  const roots=state.categories.filter(x=>!x.parent_id);
  $("#categories").innerHTML=roots.map(r=>`<div class="category" onclick="searchCat(${r.id})">▶ ${esc(r.name)}</div>`).join("");
}
async function loadPosts(params=""){
  const data=await api("/api/posts?limit=20"+params);
  $("#posts").innerHTML=data.length?data.map(p=>`
    <article class="post">
      <div class="post-title"><a href="#" onclick="viewPost(${p.id});return false">${String(p.id).padStart(4,"0")} :: ${esc(p.title)}</a></div>
      <div class="meta">${esc(p.manufacturer||"-")} / ${esc(p.model||"-")} :: ${esc(p.platform||"-")} :: ${esc(p.category||"-")} :: ${bytes(p.total_bytes)} :: ${date(p.created_at)} :: por ${esc(p.username)}</div>
    </article>`).join(""):msg("Nenhuma postagem encontrada.");
}
function page(name){
  if(name==="home"){location.hash="";location.reload();return}
  if(name==="search")showSearch();
  if(name==="profile")showProfile();
  if(name==="post")showPostForm();
  if(name==="auth")showAuth();
}
function showSearch(){
  $("#content").innerHTML=`<div class="panel"><h2>PROCURAR</h2>
    <form id="searchForm"><div class="grid">
    <div class="field full"><label>PALAVRA-CHAVE</label><input name="q" placeholder="Nome do jogo..."></div>
    <div class="field"><label>FABRICANTE</label><input name="manufacturer" placeholder="Sega, Nintendo..."></div>
    <div class="field"><label>MODELO</label><input name="model" placeholder="Mega Drive..."></div>
    </div><div class="actions"><button>[ PROCURAR ]</button></div></form><div id="searchResults"></div></div>`;
  $("#searchForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const q=new URLSearchParams(f);const d=await api("/api/posts?limit=100&"+q);$("#searchResults").innerHTML=d.map(p=>`<div class="post"><a href="#" onclick="viewPost(${p.id});return false">${esc(p.title)}</a><div class="meta">${esc(p.manufacturer)} / ${esc(p.model)} / ${esc(p.platform)} / ${esc(p.category)}</div></div>`).join("")||msg("Nada encontrado.")};
}
function searchCat(id){showSearch();setTimeout(()=>{$("#searchResults").textContent="Carregando...";api("/api/posts?limit=100&category="+id).then(d=>$("#searchResults").innerHTML=d.map(p=>`<div class="post"><a href="#" onclick="viewPost(${p.id});return false">${esc(p.title)}</a><div class="meta">${esc(p.manufacturer)} / ${esc(p.model)} / ${esc(p.platform)}</div></div>`).join("")||msg("Nada encontrado."))},0)}
function showAuth(){
 $("#content").innerHTML=`<div class="panel"><h2>LOGIN</h2><form id="login"><div class="grid"><div class="field"><label>USUÁRIO OU E-MAIL</label><input name="login" required></div><div class="field"><label>SENHA</label><input type="password" name="password" required></div></div><div class="actions"><button>[ ENTRAR ]</button></div></form></div>
 <div class="panel"><h2>CADASTRO</h2><form id="register"><div class="grid"><div class="field"><label>USUÁRIO</label><input name="username" required></div><div class="field"><label>E-MAIL</label><input type="email" name="email" required></div><div class="field"><label>SENHA</label><input type="password" name="password" minlength="8" required></div></div><div class="actions"><button>[ CADASTRAR ]</button></div></form></div>`;
 $("#login").onsubmit=async e=>{e.preventDefault();try{await api("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await refreshMe();showProfile()}catch(x){alert(x.message)}};
 $("#register").onsubmit=async e=>{e.preventDefault();try{await api("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await refreshMe();showProfile()}catch(x){alert(x.message)}};
}
async function logout(){await api("/api/auth/logout",{method:"POST"});await refreshMe();page("home")}
function showProfile(){
 if(!state.user){showAuth();return}
 $("#content").innerHTML=`<div class="panel"><h2>MEU PERFIL</h2>
 <form id="profile"><div class="grid"><div class="field"><label>USUÁRIO</label><input value="${esc(state.user.username)}" disabled></div><div class="field"><label>E-MAIL</label><input value="${esc(state.user.email)}" disabled></div>
 <div class="field"><label>AVATAR (URL)</label><input name="avatar" value="${esc(state.user.avatar||"")}"></div><div class="field"><label>BIO</label><textarea name="bio" rows="4">${esc(state.user.bio||"")}</textarea></div></div><div class="actions"><button>[ SALVAR ]</button></div></form></div>`;
 $("#profile").onsubmit=async e=>{e.preventDefault();await api("/api/users/me",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await refreshMe();alert("Perfil atualizado.")};
}
function showPostForm(){
 if(!state.user){showAuth();return}
 const cats=state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
 $("#content").innerHTML=`<div class="panel"><h2>NOVA POSTAGEM</h2><div class="notice">Publique somente material autorizado para distribuição.</div>
 <form id="postForm" enctype="multipart/form-data"><div class="grid">
 <div class="field full"><label>TÍTULO</label><input name="title" required maxlength="180"></div>
 <div class="field"><label>CATEGORIA</label><select name="category_id"><option value="">-- selecione --</option>${cats}</select></div>
 <div class="field"><label>FABRICANTE</label><input name="manufacturer" placeholder="Sega"></div>
 <div class="field"><label>MODELO</label><input name="model" placeholder="Mega Drive"></div>
 <div class="field"><label>PLATAFORMA</label><input name="platform" placeholder="Console"></div>
 <div class="field"><label>REGIÃO</label><input name="region" placeholder="BR / US / JP"></div>
 <div class="field"><label>ANO</label><input type="number" name="year"></div>
 <div class="field full"><label>DESCRIÇÃO</label><textarea name="description" rows="6"></textarea></div>
 <div class="field full"><label>ARQUIVOS AUTORIZADOS</label><input type="file" name="files" multiple></div>
 </div><div class="actions"><button>[ PUBLICAR ]</button></div></form></div>`;
 $("#postForm").onsubmit=async e=>{e.preventDefault();try{const r=await api("/api/posts",{method:"POST",body:new FormData(e.target)});alert("Postagem criada: #"+r.id);viewPost(r.id)}catch(x){alert(x.message)}}
}
async function viewPost(id){
 const p=await api("/api/posts/"+id);
 $("#content").innerHTML=`<div class="panel"><h2>${esc(p.title)}</h2>
 <div class="meta">AUTOR: ${esc(p.username)} :: CATEGORIA: ${esc(p.category)} :: ${esc(p.manufacturer)} / ${esc(p.model)} / ${esc(p.platform)}</div>
 <p>${esc(p.description||"Sem descrição.")}</p>
 <h3>ARQUIVOS</h3>${p.files.map(f=>`<div class="post"><a href="/api/files/${f.id}">${esc(f.original_name)}</a> :: ${bytes(f.size_bytes)} :: SHA256 ${esc(f.sha256)}</div>`).join("")||"<p>Nenhum arquivo.</p>"}</div>`;
}
init().catch(e=>console.error(e));
