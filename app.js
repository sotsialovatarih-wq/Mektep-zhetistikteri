const SUPABASE_URL = 'https://kjgxqgelzbowcorjtslj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_021EWd0xCydHQ0TN-C-yAQ_v9gQruhc';

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const STORAGE_BUCKET = 'achievement-documents';

let currentTeacher = null;
let currentUser = null;
let achievements = [];
let teacherMap = {};
let role = 'teacher';
let currentLanguage = localStorage.getItem('siteLanguage') || 'kk';
let currentDocumentUrl = null;
let currentAchievementId = null;
let editingAchievementId = null;

/* =========================================================
   HELPERS
========================================================= */

function tr(kk, ru) {
  return currentLanguage === 'ru' ? ru : kk;
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return '—';

  try {
    return new Date(value).toLocaleDateString(
      currentLanguage === 'ru' ? 'ru-RU' : 'kk-KZ'
    );
  } catch {
    return value;
  }
}

function displayLevel(value) {
  const map = {
    'Мектепішілік': 'Школьный',
    'Қалалық': 'Городской',
    'Аудандық': 'Районный',
    'Облыстық': 'Областной',
    'Республикалық': 'Республиканский',
    'Халықаралық': 'Международный'
  };

  return currentLanguage === 'ru'
    ? (map[value] || value || '—')
    : (value || '—');
}

function displayType(value) {
  const map = {
    'Диплом': 'Диплом',
    'Грамота': 'Грамота',
    'Сертификат': 'Сертификат',
    'Алғыс хат': 'Благодарственное письмо',
    'Басқа': 'Другое'
  };

  return currentLanguage === 'ru'
    ? (map[value] || value || '—')
    : (value || '—');
}

function ownerLabel(ownerType) {
  if (ownerType === 'student') {
    return tr('Оқушы жетістігі', 'Достижение ученика');
  }

  return tr('Мұғалім жетістігі', 'Достижение учителя');
}

function pageTitle(kk, ru) {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = tr(kk, ru);
}

function showMessage(message) {
  alert(message);
}

/* =========================================================
   LANGUAGE
========================================================= */

function setLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem('siteLanguage', lang);

  document.documentElement.lang = lang === 'ru' ? 'ru' : 'kk';

  document.querySelectorAll('[data-kk][data-ru]').forEach(el => {
    el.textContent = lang === 'ru'
      ? el.dataset.ru
      : el.dataset.kk;
  });

  document.querySelectorAll('[data-placeholder-kk][data-placeholder-ru]')
    .forEach(el => {
      el.placeholder = lang === 'ru'
        ? el.dataset.placeholderRu
        : el.dataset.placeholderKk;
    });

  renderAll();
}

function applyLanguage() {
  setLanguage(currentLanguage);
}

/* =========================================================
   LOGIN
========================================================= */

async function login() {
  const emailEl = document.getElementById('email');
  const passwordEl = document.getElementById('password');

  const userEmail = emailEl.value.trim();
  const userPassword = passwordEl.value;

  if (!userEmail || !userPassword) {
    showMessage(
      tr(
        'Электрондық пошта мен құпия сөзді енгізіңіз.',
        'Введите электронную почту и пароль.'
      )
    );
    return;
  }

  const { data, error } = await db.auth.signInWithPassword({
    email: userEmail,
    password: userPassword
  });

  if (error) {
    showMessage(
      tr('Кіру қатесі: ', 'Ошибка входа: ') + error.message
    );
    return;
  }

  currentUser = data.user;

  await loadProfile(data.user);
}

async function loadProfile(user) {
  let teacher = null;

  const teacherResult = await db
    .from('teachers')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!teacherResult.error && teacherResult.data) {
    teacher = teacherResult.data;
  }

  if (!teacher) {
    await db.auth.signOut();

    showMessage(
      tr(
        'Профиль табылмады. Әкімшілікке хабарласыңыз.',
        'Профиль не найден. Обратитесь к администрации.'
      )
    );

    return;
  }

  currentTeacher = teacher;

  role = detectRole(teacher);

  document.getElementById('who').textContent =
    teacher.full_name || user.email;

  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  if (role === 'admin') {
    document.getElementById('adminBtn').classList.remove('hidden');
  } else {
    document.getElementById('adminBtn').classList.add('hidden');
  }

  await loadAchievements();
  await loadAdminData();

  show('dashboard');
}

function detectRole(profile) {
  const explicitRole = normalize(profile.role);

  if (
    explicitRole === 'admin' ||
    explicitRole === 'administrator' ||
    explicitRole === 'administration'
  ) {
    return 'admin';
  }

  const position = normalize(profile.position);

  const adminWords = [
    'директор',
    'заместитель',
    'орынбасар',
    'әкімшілік',
    'администратор',
    'завуч'
  ];

  if (adminWords.some(word => position.includes(word))) {
    return 'admin';
  }

  return 'teacher';
}

async function logout() {
  await db.auth.signOut();

  currentTeacher = null;
  currentUser = null;
  achievements = [];
  teacherMap = {};
  role = 'teacher';

  document.getElementById('app').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');

  document.getElementById('password').value = '';
}

/* =========================================================
   SESSION
========================================================= */

async function restoreSession() {
  const { data } = await db.auth.getSession();

  if (data?.session?.user) {
    currentUser = data.session.user;
    await loadProfile(data.session.user);
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

function show(id) {
  document
    .querySelectorAll('.main-content > section')
    .forEach(section => {
      section.classList.add('hidden');
    });

  const section = document.getElementById(id);

  if (section) {
    section.classList.remove('hidden');
  }

  if (id === 'dashboard') {
    pageTitle('Басты бет', 'Главная');
  }

  if (id === 'add') {
    pageTitle('Жетістік қосу', 'Добавить достижение');
  }

  if (id === 'admin') {
    pageTitle('Әкімшілік', 'Администрация');
    renderAdminAchievements();
  }

  renderAll();
}

function showTeacherAchievements() {
  show('teacherAchievements');
  pageTitle('Мұғалім жетістігі', 'Достижения учителя');
  renderTeacherAchievements();
}

function showStudentAchievements() {
  show('studentAchievements');
  pageTitle('Оқушы жетістігі', 'Достижения ученика');
  renderStudentAchievements();
}

function showAllAchievements() {
  show('achievements');
  pageTitle('Барлық жетістіктер', 'Все достижения');
  renderAchievements();
}

/* =========================================================
   LOAD ACHIEVEMENTS
========================================================= */

async function loadAchievements() {
  if (!currentTeacher) return;

  let query = db
    .from('achievements')
    .select('*')
    .order('created_at', { ascending: false });

  /*
    Мұғалім тек өзіне және өз оқушыларына қатысты
    жетістіктерді көреді.
    Әкімшілік үшін барлық жазбаларды сұраймыз.
    RLS арқылы әкімшілікке бөлек рұқсат кейін қойылады.
  */
  if (role !== 'admin') {
    query = query.eq('teacher_id', currentTeacher.id);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);

    showMessage(
      tr(
        'Жетістіктерді жүктеу қатесі: ',
        'Ошибка загрузки достижений: '
      ) + error.message
    );

    return;
  }

  achievements = data || [];

  await loadTeacherMap();

  renderAll();
}

async function loadTeacherMap() {
  teacherMap = {};

  const ids = [
    ...new Set(
      achievements
        .map(item => item.teacher_id)
        .filter(Boolean)
    )
  ];

  if (!ids.length) return;

  const { data, error } = await db
    .from('teachers')
    .select('id, full_name')
    .in('id', ids);

  if (error) {
    console.warn('Teacher map:', error.message);
    return;
  }

  (data || []).forEach(teacher => {
    teacherMap[teacher.id] = teacher.full_name;
  });
}

/* =========================================================
   DASHBOARD
========================================================= */

function updateDashboard() {
  const total = achievements.length;

  const teacherCount = achievements.filter(
    item => item.owner_type !== 'student'
  ).length;

  const studentCount = achievements.filter(
    item => item.owner_type === 'student'
  ).length;

  const republicCount = achievements.filter(
    item => normalize(item.level) === normalize('Республикалық')
  ).length;

  setText('totalAchievements', total);
  setText('teacherAchievementsCount', teacherCount);
  setText('studentAchievementsCount', studentCount);
  setText('republicAchievements', republicCount);

  const recent = achievements.slice(0, 6);

  renderCards('recent', recent);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* =========================================================
   FILTERED SECTIONS
========================================================= */

function renderTeacherAchievements() {
  const data = achievements.filter(
    item => item.owner_type !== 'student'
  );

  renderCards('teacherAchievementList', data);
}

function renderStudentAchievements() {
  const data = achievements.filter(
    item => item.owner_type === 'student'
  );

  renderCards('studentAchievementList', data);
}

function renderAchievements() {
  const searchEl = document.getElementById('search');
  const ownerEl = document.getElementById('ownerFilter');
  const levelEl = document.getElementById('levelFilter');

  const search = normalize(searchEl?.value);
  const owner = ownerEl?.value || '';
  const level = levelEl?.value || '';

  const filtered = achievements.filter(item => {
    const teacherName =
      teacherMap[item.teacher_id] ||
      currentTeacher?.full_name ||
      '';

    const haystack = [
      item.title,
      item.subject,
      item.level,
      item.place,
      item.achievement_year,
      item.achievement_type,
      item.student_name,
      item.class_name,
      teacherName
    ]
      .map(normalize)
      .join(' ');

    const matchesSearch =
      !search || haystack.includes(search);

    const itemOwner =
      item.owner_type === 'student'
        ? 'student'
        : 'teacher';

    const matchesOwner =
      !owner || itemOwner === owner;

    const matchesLevel =
      !level || item.level === level;

    return matchesSearch && matchesOwner && matchesLevel;
  });

  renderCards('list', filtered);
}

/* =========================================================
   CARDS
========================================================= */

function renderCards(containerId, data) {
  const container = document.getElementById(containerId);

  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${tr(
          'Әзірге жетістік жоқ.',
          'Пока достижений нет.'
        )}
      </div>
    `;
    return;
  }

  container.innerHTML = data
    .map(item => achievementCard(item))
    .join('');
}

function achievementCard(item) {
  const isStudent = item.owner_type === 'student';

  const personName = isStudent
    ? (item.student_name || tr('Оқушы', 'Ученик'))
    : (
        teacherMap[item.teacher_id] ||
        currentTeacher?.full_name ||
        tr('Мұғалім', 'Учитель')
      );

  const subtitle = [
    item.title,
    item.place,
    item.achievement_year
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <article
      class="achievement-card"
      onclick="openAchievement(${Number(item.id)})"
      role="button"
      tabindex="0"
    >
      <div>
        <span class="badge">
          ${esc(ownerLabel(item.owner_type))}
        </span>

        ${
          item.achievement_type
            ? `<span class="badge">${esc(displayType(item.achievement_type))}</span>`
            : ''
        }
      </div>

      <h3>${esc(personName)}</h3>

      <p>${esc(subtitle || '—')}</p>

      ${
        item.level
          ? `<span class="badge">${esc(displayLevel(item.level))}</span>`
          : ''
      }

      ${
        item.subject
          ? `<span class="badge">${esc(item.subject)}</span>`
          : ''
      }
    </article>
  `;
}

/* =========================================================
   ADD ACHIEVEMENT FORM
========================================================= */

function toggleOwnerFields() {
  const owner = document.getElementById('ownerType').value;

  const studentNameField =
    document.getElementById('studentNameField');

  const classNameField =
    document.getElementById('classNameField');

  const studentName =
    document.getElementById('studentName');

  if (owner === 'student') {
    studentNameField.classList.remove('hidden');
    classNameField.classList.remove('hidden');

    studentName.required = true;
  } else {
    studentNameField.classList.add('hidden');
    classNameField.classList.add('hidden');

    studentName.required = false;
  }
}

function toggleOtherType() {
  const type = document.getElementById('type').value;
  const field = document.getElementById('otherTypeField');
  const input = document.getElementById('otherType');

  if (type === 'Басқа') {
    field.classList.remove('hidden');
    input.required = true;
  } else {
    field.classList.add('hidden');
    input.required = false;
    input.value = '';
  }
}

async function saveAchievement(event) {
  event.preventDefault();

  if (!currentTeacher) {
    showMessage(
      tr(
        'Мұғалім профилі табылмады.',
        'Профиль учителя не найден.'
      )
    );
    return;
  }

  const submitButton =
    document.querySelector('#achievementForm button[type="submit"]');

  const oldText = submitButton.textContent;

  submitButton.disabled = true;
  submitButton.textContent =
    tr('Сақталуда...', 'Сохранение...');

  try {
    const ownerType =
      document.getElementById('ownerType').value;

    const selectedType =
      document.getElementById('type').value;

    const otherType =
      document.getElementById('otherType').value.trim();

    const achievementType =
      selectedType === 'Басқа'
        ? otherType
        : selectedType;

    const file =
      document.getElementById('documentFile').files[0];

    let documentUrl = null;

    if (file) {
      documentUrl = await uploadDocument(file);
    }

    const payload = {
      owner_type: ownerType,
      teacher_id: currentTeacher.id,
      student_id: null,

      title:
        document.getElementById('title').value.trim(),

      achievement_type: achievementType || null,

      level:
        document.getElementById('level').value || null,

      place:
        document.getElementById('place').value.trim() || null,

      achievement_year:
        document.getElementById('year').value
          ? Number(document.getElementById('year').value)
          : null,

      subject:
        document.getElementById('subject').value.trim() || null,

      event_date:
        document.getElementById('eventDate').value || null,

      document_url: documentUrl,

      student_name:
        ownerType === 'student'
          ? document.getElementById('studentName').value.trim()
          : null,

      class_name:
        ownerType === 'student'
          ? document.getElementById('className').value.trim() || null
          : null
    };

   let saveResult;

if (editingAchievementId) {
  if (!file) {
    payload.document_url = currentDocumentUrl;
  }

  saveResult = await db
    .from('achievements')
    .update(payload)
    .eq('id', editingAchievementId);
} else {
  saveResult = await db
    .from('achievements')
    .insert(payload);
}

const { error } = saveResult; 

    if (error) {
      throw error;
    }

    document.getElementById('achievementForm').reset();
    editingAchievementId = null;
currentDocumentUrl = null;
    

    toggleOwnerFields();
    toggleOtherType();

    await loadAchievements();

    showMessage(
      tr(
        'Жетістік сәтті сақталды!',
        'Достижение успешно сохранено!'
      )
    );

    showAllAchievements();

  } catch (error) {
    console.error(error);

    showMessage(
      tr(
        'Сақтау қатесі: ',
        'Ошибка сохранения: '
      ) + error.message
    );

  } finally {
    submitButton.disabled = false;
    submitButton.textContent = oldText;
  }
}

/* =========================================================
   STORAGE
========================================================= */

async function uploadDocument(file) {
  const maxSize = 15 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error(
      tr(
        'Файл көлемі 15 МБ-тан аспауы керек.',
        'Размер файла не должен превышать 15 МБ.'
      )
    );
  }

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'application/pdf'
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      tr(
        'Тек JPG, PNG немесе PDF жүктеуге болады.',
        'Можно загружать только JPG, PNG или PDF.'
      )
    );
  }

  const ext =
    file.name.split('.').pop().toLowerCase();

  const safeName =
    file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 80);

  const path =
    `${currentTeacher.id}/${Date.now()}-${safeName}.${ext}`;

  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });

  if (error) {
    throw new Error(
      tr(
        'Құжатты жүктеу мүмкін болмады. Storage баптау қажет: ',
        'Не удалось загрузить документ. Необходимо настроить Storage: '
      ) + error.message
    );
  }

  const { data } = db.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

/* =========================================================
   ACHIEVEMENT MODAL
========================================================= */

function openAchievement(id) {
  const item = achievements.find(
    achievement => Number(achievement.id) === Number(id)
  );

  if (!item) return;
currentAchievementId = Number(item.id);
  
  const isStudent = item.owner_type === 'student';

  const teacherName =
    teacherMap[item.teacher_id] ||
    currentTeacher?.full_name ||
    '—';

  const personName = isStudent
    ? (item.student_name || '—')
    : teacherName;

  const details =
    document.getElementById('achievementDetails');

  details.innerHTML = `
    <span class="badge">
      ${esc(ownerLabel(item.owner_type))}
    </span>

    ${
      item.achievement_type
        ? `<span class="badge">${esc(displayType(item.achievement_type))}</span>`
        : ''
    }

    <h2>${esc(item.title || tr('Жетістік', 'Достижение'))}</h2>

    <p>${esc(personName)}</p>

    <div class="detail-grid">

      <div class="detail-item">
        <small>${tr('Аты-жөні', 'ФИО')}</small>
        <strong>${esc(personName)}</strong>
      </div>

      ${
        isStudent
          ? `
            <div class="detail-item">
              <small>${tr('Сыныбы', 'Класс')}</small>
              <strong>${esc(item.class_name || '—')}</strong>
            </div>

            <div class="detail-item">
              <small>${tr('Мұғалімі', 'Учитель')}</small>
              <strong>${esc(teacherName)}</strong>
            </div>
          `
          : ''
      }

      <div class="detail-item">
        <small>${tr('Жетістік түрі', 'Тип достижения')}</small>
        <strong>${esc(displayType(item.achievement_type))}</strong>
      </div>

      <div class="detail-item">
        <small>${tr('Пән', 'Предмет')}</small>
        <strong>${esc(item.subject || '—')}</strong>
      </div>

      <div class="detail-item">
        <small>${tr('Деңгейі', 'Уровень')}</small>
        <strong>${esc(displayLevel(item.level))}</strong>
      </div>

      <div class="detail-item">
        <small>${tr('Орын / нәтиже', 'Место / результат')}</small>
        <strong>${esc(item.place || '—')}</strong>
      </div>

      <div class="detail-item">
        <small>${tr('Жылы', 'Год')}</small>
        <strong>${esc(item.achievement_year || '—')}</strong>
      </div>

      <div class="detail-item">
        <small>${tr('Өткізілген күні', 'Дата проведения')}</small>
        <strong>${esc(formatDate(item.event_date))}</strong>
      </div>

    </div>
  `;

  currentDocumentUrl = item.document_url || null;

  renderDocument(item.document_url);

  document
    .getElementById('achievementModal')
    .classList.remove('hidden');
}

function renderDocument(url) {
  const preview =
    document.getElementById('documentPreview');

  const viewBtn =
    document.getElementById('viewDocumentBtn');

  const downloadBtn =
    document.getElementById('downloadDocumentBtn');

  const printBtn =
    document.getElementById('printDocumentBtn');

  preview.innerHTML = '';

  if (!url) {
    viewBtn.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    printBtn.classList.add('hidden');

    preview.innerHTML = `
      <div class="empty-state">
        ${tr(
          'Электронды құжат тіркелмеген.',
          'Электронный документ не прикреплен.'
        )}
      </div>
    `;

    return;
  }

  viewBtn.href = url;
  downloadBtn.href = url;

  viewBtn.classList.remove('hidden');
  downloadBtn.classList.remove('hidden');
  printBtn.classList.remove('hidden');

  const cleanUrl =
    url.toLowerCase().split('?')[0];

  if (
    cleanUrl.endsWith('.jpg') ||
    cleanUrl.endsWith('.jpeg') ||
    cleanUrl.endsWith('.png')
  ) {
    preview.innerHTML = `
      <img
        src="${esc(url)}"
        alt="${esc(tr('Жетістік құжаты', 'Документ достижения'))}"
      >
    `;
  } else if (cleanUrl.endsWith('.pdf')) {
    preview.innerHTML = `
      <iframe
        src="${esc(url)}"
        title="${esc(tr('Құжат', 'Документ'))}">
      </iframe>
    `;
  }
}
async function deleteCurrentAchievement() {
  if (!currentAchievementId) return;

  const confirmed = confirm(
    tr(
      'Бұл жетістікті өшіргіңіз келе ме? Бұл әрекетті кері қайтару мүмкін емес.',
      'Удалить это достижение? Это действие нельзя отменить.'
    )
  );

  if (!confirmed) return;

  const item = achievements.find(
    achievement =>
      Number(achievement.id) === Number(currentAchievementId)
  );

  if (!item) return;

  if (
    role !== 'admin' &&
    Number(item.teacher_id) !== Number(currentTeacher?.id)
  ) {
    showMessage(
      tr(
        'Бұл жетістікті өшіруге рұқсатыңыз жоқ.',
        'У вас нет разрешения на удаление этого достижения.'
      )
    );
    return;
  }

  const { error } = await db
    .from('achievements')
    .delete()
    .eq('id', currentAchievementId);

  if (error) {
    showMessage(
      tr('Өшіру қатесі: ', 'Ошибка удаления: ') + error.message
    );
    return;
  }

  document
    .getElementById('achievementModal')
    .classList.add('hidden');

  currentAchievementId = null;
  currentDocumentUrl = null;

  await loadAchievements();

  showMessage(
    tr(
      'Жетістік сәтті өшірілді.',
      'Достижение успешно удалено.'
    )
  );
}
function editCurrentAchievement() {
  if (!currentAchievementId) return;

  const item = achievements.find(
    achievement =>
      Number(achievement.id) === Number(currentAchievementId)
  );

  if (!item) return;

  if (
    role !== 'admin' &&
    Number(item.teacher_id) !== Number(currentTeacher?.id)
  ) {
    showMessage(
      tr(
        'Бұл жетістікті өңдеуге рұқсатыңыз жоқ.',
        'У вас нет разрешения на редактирование этого достижения.'
      )
    );
    return;
  }

  editingAchievementId = Number(item.id);

  document.getElementById('ownerType').value =
    item.owner_type === 'student' ? 'student' : 'teacher';

  toggleOwnerFields();

  document.getElementById('studentName').value =
    item.student_name || '';

  document.getElementById('className').value =
    item.class_name || '';

  const standardTypes = [
    'Диплом',
    'Грамота',
    'Сертификат',
    'Алғыс хат'
  ];

  if (standardTypes.includes(item.achievement_type)) {
    document.getElementById('type').value =
      item.achievement_type || 'Диплом';

    document.getElementById('otherType').value = '';
  } else {
    document.getElementById('type').value = 'Басқа';
    document.getElementById('otherType').value =
      item.achievement_type || '';
  }

  toggleOtherType();

  document.getElementById('title').value =
    item.title || '';

  document.getElementById('subject').value =
    item.subject || '';

  document.getElementById('level').value =
    item.level || 'Мектепішілік';

  document.getElementById('place').value =
    item.place || '';

  document.getElementById('year').value =
    item.achievement_year || '';

  document.getElementById('eventDate').value =
    item.event_date
      ? String(item.event_date).slice(0, 10)
      : '';

  document.getElementById('documentFile').value = '';

  currentDocumentUrl = item.document_url || null;

  document
    .getElementById('achievementModal')
    .classList.add('hidden');

  show('add');

  pageTitle(
    'Жетістікті өңдеу',
    'Редактировать достижение'
  );

  const submitButton =
    document.querySelector(
      '#achievementForm button[type="submit"]'
    );

  if (submitButton) {
    submitButton.textContent =
      tr('Өзгерістерді сақтау', 'Сохранить изменения');
  }
}
function closeAchievementModal(event) {
  if (
    event &&
    event.target !== document.getElementById('achievementModal')
  ) {
    return;
  }

  document
    .getElementById('achievementModal')
    .classList.add('hidden');

  currentDocumentUrl = null;
}

function printCurrentDocument() {
  if (!currentDocumentUrl) {
    window.print();
    return;
  }

  const win = window.open(
    currentDocumentUrl,
    '_blank'
  );

  if (!win) {
    showMessage(
      tr(
        'Браузер жаңа терезені бұғаттады.',
        'Браузер заблокировал новое окно.'
      )
    );
    return;
  }

  setTimeout(() => {
    try {
      win.print();
    } catch {
      // Кейбір PDF viewer-де print қолмен басылады.
    }
  }, 1200);
}

/* =========================================================
   ADMINISTRATION
========================================================= */

async function loadAdminData() {
  if (role !== 'admin') return;

  const teacherResult = await db
    .from('teachers')
    .select('id', { count: 'exact', head: true });

  if (!teacherResult.error) {
    setText('aTeachers', teacherResult.count || 0);
  }

  /*
    students кестесі бар болса санын көрсетеміз.
    Кестеге рұқсат жоқ болса сайттың қалған бөлігі жұмысын жалғастырады.
  */
  const studentResult = await db
    .from('students')
    .select('id', { count: 'exact', head: true });

  if (!studentResult.error) {
    setText('aStudents', studentResult.count || 0);
  }

  setText('aAchievements', achievements.length);

  renderAdminAchievements();
}

function renderAdminAchievements() {
  if (role !== 'admin') return;

  setText('aAchievements', achievements.length);

  renderCards(
    'adminAchievementList',
    achievements
  );
}

/* =========================================================
   GLOBAL RENDER
========================================================= */

function renderAll() {
  if (!currentTeacher) return;

  updateDashboard();
  renderTeacherAchievements();
  renderStudentAchievements();
  renderAchievements();

  if (role === 'admin') {
    renderAdminAchievements();
  }
}

/* =========================================================
   ESC KEY
========================================================= */

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const modal =
      document.getElementById('achievementModal');

    if (modal && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
      currentDocumentUrl = null;
    }
  }
});

/* =========================================================
   START
========================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  applyLanguage();

  toggleOwnerFields();
  toggleOtherType();

  await restoreSession();
});
