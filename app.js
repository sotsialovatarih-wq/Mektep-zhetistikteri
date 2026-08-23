const SUPABASE_URL = 'https://kjgxqgelzbowcorjtslj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_021EWd0xCydHQ0TN-C-yAQ_v9gQruhc';

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);                            let role='teacher';
let students=JSON.parse(localStorage.getItem('students')||'["Нұрлан Әли — 8А","Айша Ермек — 9Б"]');
let achievements=JSON.parse(localStorage.getItem('achievements')||'[{"person":"Нұрлан Әли","type":"Диплом","competition":"Математика олимпиадасы","level":"Облыстық","place":"II орын","year":"2026"},{"person":"Айша Ермек","type":"Грамота","competition":"Ғылыми жоба","level":"Республикалық","place":"I орын","year":"2026"}]');
async function login() {
  const userEmail = email.value.trim();
  const userPassword = password.value;

  const { data, error } = await db.auth.signInWithPassword({
    email: userEmail,
    password: userPassword
  });

  if (error) {
    alert('Email немесе пароль қате');
    return;
  }

  const { data: teacher, error: teacherError } = await db
    .from('teachers')
    .select('*')
    .eq('user_id', data.user.id)
    .single();

  if (teacherError || !teacher) {
    await db.auth.signOut();
    alert('Мұғалім профилі табылмады');
    return;
  }

  role = 'teacher';
  document.getElementById('who').textContent = teacher.full_name;
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  show('dashboard');
}
function logout(){app.classList.add('hidden');document.getElementById('login').classList.remove('hidden')}
function show(id){document.querySelectorAll('main section').forEach(x=>x.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');render()}
function render(){total.textContent=achievements.length;studentCount.textContent=students.length;repCount.textContent=achievements.filter(x=>x.level==='Республикалық').length;aStudents.textContent=students.length;aAchievements.textContent=achievements.length;recent.innerHTML=achievements.slice(-4).reverse().map(card).join('')||'<p>Әзірге жетістік жоқ.</p>';studentList.innerHTML=students.map(x=>`<div class="student"><b>👨‍🎓 ${x}</b><p>${achievements.filter(a=>x.includes(a.person)).length} жетістік</p></div>`).join('');renderAchievements()}
function card(a){return `<div class="item"><div><b>${a.person}</b><div>${a.competition} · ${a.place||'Нәтиже көрсетілмеген'} · ${a.year}</div></div><span class="badge">${a.level}</span></div>`}
function renderAchievements(){if(!document.getElementById('achievementList'))return;let q=(search.value||'').toLowerCase();achievementList.innerHTML=achievements.filter(a=>JSON.stringify(a).toLowerCase().includes(q)).map(card).join('')||'<p>Нәтиже табылмады.</p>'}
function addStudent(){let n=prompt('Оқушының аты-жөні және сыныбы (мысалы: Аружан Серік — 7А)');if(n){students.push(n);localStorage.setItem('students',JSON.stringify(students));render()}}
function saveAchievement(e){e.preventDefault();let f=document.getElementById('file').files[0];achievements.push({person:person.value,type:type.value,competition:competition.value,level:level.value,place:place.value,year:year.value,file:f?f.name:''});localStorage.setItem('achievements',JSON.stringify(achievements));e.target.reset();year.value=2026;alert('Жетістік сақталды!');show('achievements')}
render();
