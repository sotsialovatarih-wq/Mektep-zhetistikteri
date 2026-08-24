const SUPABASE_URL = 'https://kjgxqgelzbowcorjtslj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_021EWd0xCydHQ0TN-C-yAQ_v9gQruhc';

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let role = 'teacher';
let currentTeacher = null;
let achievements = [];

async function login() {
  const userEmail = email.value.trim();
  const userPassword = password.value;

  const { data, error } = await db.auth.signInWithPassword({
    email: userEmail,
    password: userPassword
  });

  if (error) {
    alert('Кіру қатесі: ' + error.message);
    return;
  }

  const { data: teacher, error: teacherError } = await db
    .from('teachers')
    .select('*')
    .eq('user_id', data.user.id)
    .single();

  if (teacherError || !teacher) {
    await db.auth.signOut();
    alert('Профиль қатесі: ' + (teacherError?.message || 'Мұғалім табылмады'));
    return;
  }

  currentTeacher = teacher;
  role = 'teacher';

  document.getElementById('who').textContent = teacher.full_name;
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  await loadAchievements();
  show('dashboard');
}

async function logout() {
  await db.auth.signOut();
  currentTeacher = null;
  achievements = [];

  document.getElementById('app').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
}

function show(id) {
  document.querySelectorAll('main section').forEach(x => {
    x.classList.add('hidden');
  });

  document.getElementById(id).classList.remove('hidden');
  render();
}

async function loadAchievements() {
  if (!currentTeacher) return;

  const { data, error } = await db
    .from('achievements')
    .select('*')
    .eq('teacher_id', currentTeacher.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    alert('Жетістіктерді жүктеу қатесі: ' + error.message);
    return;
  }

  achievements = (data || []).map(a => ({
    id: a.id,
    person: a.student_name || currentTeacher.full_name,
    className: a.class_name || '',
    type: a.achievement_type || '',
    competition: a.title || '',
    level: a.level || '',
    place: a.place || '',
    year: a.achievement_year || '',
    ownerType: a.owner_type || 'student'
  }));

  render();
}

function render() {
  const total = document.getElementById('total');
  const studentCount = document.getElementById('studentCount');
  const repCount = document.getElementById('repCount');
  const aTeachers = document.getElementById('aTeachers');
  const aStudents = document.getElementById('aStudents');
  const aAchievements = document.getElementById('aAchievements');
  const recent = document.getElementById('recent');
  const studentList = document.getElementById('studentList');

  const uniqueStudents = new Set(
    achievements
      .filter(a => a.ownerType === 'student')
     .map(a => a.person + '|' + a.className) 
  );

  if (total) total.textContent = achievements.length;
  if (studentCount) studentCount.textContent = uniqueStudents.size;

  if (repCount) {
    repCount.textContent = achievements.filter(
      a => a.level === 'Республикалық'
    ).length;
  }

  if (aTeachers) aTeachers.textContent = currentTeacher ? 1 : 0;
  if (aStudents) aStudents.textContent = uniqueStudents.size;
  if (aAchievements) aAchievements.textContent = achievements.length;

  if (recent) {
    recent.innerHTML =
      achievements.slice(0, 4).map(card).join('') ||
      '<p>Әзірге жетістік жоқ.</p>';
  }

  if (studentList) {
    const students = {};

    achievements
      .filter(a => a.ownerType === 'student')
      .forEach(a => {
        const key = a.person + '|' + a.className;

        if (!students[key]) {
          students[key] = {
            name: a.person,
            className: a.className,
            count: 0
          };
        }

        students[key].count++;
      });

    studentList.innerHTML =
      Object.values(students).map(s => `
        <div class="student">
          <b>🎓 ${s.name}</b>
          <p>${s.className ? s.className + ' сынып · ' : ''}${s.count} жетістік</p>
        </div>
      `).join('') || '<p>Әзірге оқушы жетістігі жоқ.</p>';
  }

  renderAchievements();
}

function card(a) {
  const classText = a.className ? ` · ${a.className}` : '';

  return `
    <div class="item">
      <div>
        <b>${a.person}</b>
        <div>
          ${a.competition} · ${a.place || 'Нәтиже көрсетілмеген'} · ${a.year}${classText}
        </div>
      </div>
      <span class="badge">${a.level}</span>
    </div>
  `;
}

function renderAchievements() {
  const list = document.getElementById('achievementList');
  if (!list) return;

  const searchInput = document.getElementById('search');
  const q = (searchInput?.value || '').toLowerCase();

  const filtered = achievements.filter(a =>
    JSON.stringify(a).toLowerCase().includes(q)
  );

  list.innerHTML =
    filtered.map(card).join('') ||
    '<p>Нәтиже табылмады.</p>';
}

function addStudent() {
  alert('Оқушыларды алдын ала тіркеудің қажеті жоқ. Оқушының аты-жөні мен сыныбын "Жетістік қосу" бөлімінде енгізіңіз.');
}

async function saveAchievement(e) {
  e.preventDefault();

  if (!currentTeacher) {
    alert('Алдымен жүйеге кіріңіз.');
    return;
  }

  const personType = document.getElementById('personType').value;
  const personName = document.getElementById('person').value.trim();
  const classInput = document.getElementById('className').value.trim();
  const achievementType = document.getElementById('type').value;
  const competitionName = document.getElementById('competition').value.trim();
  const achievementLevel = document.getElementById('level').value;
  const achievementPlace = document.getElementById('place').value.trim();
  const achievementYear = Number(document.getElementById('year').value);

  const isStudent = personType === 'Оқушы';

  if (!personName || !competitionName) {
    alert('Аты-жөні мен байқау атауын толтырыңыз.');
    return;
  }

  if (isStudent && !classInput) {
    alert('Оқушының сыныбын енгізіңіз.');
    return;
  }

  const record = {
    owner_type: 'teacher',
    teacher_id: currentTeacher.id,
    student_id: null,
    student_name: isStudent ? personName : null,
    class_name: isStudent ? classInput : null,
    title: competitionName,
    achievement_type: achievementType,
    level: achievementLevel,
    place: achievementPlace || null,
    achievement_year: achievementYear || null,
    subject: currentTeacher.subject || null
  };

  const { error } = await db
    .from('achievements')
    .insert(record);

  if (error) {
    console.error(error);
    alert('Сақтау қатесі: ' + error.message);
    return;
  }

  e.target.reset();
  document.getElementById('year').value = 2026;

  alert('Жетістік сәтті сақталды!');

  await loadAchievements();
  show('achievements');
}

render();
