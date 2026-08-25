const root=document.documentElement;
const saved=localStorage.getItem('financeiro-theme');
if(saved==='dark') root.classList.add('dark');

document.getElementById('themeBtn').addEventListener('click',()=>{
  root.classList.toggle('dark');
  localStorage.setItem('financeiro-theme',root.classList.contains('dark')?'dark':'light');
});

document.querySelector('.fab').addEventListener('click',()=>{
  alert('A tela de novo lançamento entra na próxima etapa.');
});
