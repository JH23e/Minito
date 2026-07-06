// ClassGuard Client Dashboard App Logic

const socket = io();

// DOM 요소 참조
const studentsGrid = document.getElementById('students-grid');
const statTotal = document.getElementById('stat-total');
const statOnline = document.getElementById('stat-online');
const tabBtns = document.querySelectorAll('.tab-btn');

// 모달 및 설정 제어 요소 참조
const btnConfigClassroom = document.getElementById('btn-config-classroom');

// 카드 엘리먼트 캐시 (socket.id -> DOM Element)
const activeCards = {};

// 전체화면 줌 모달 관련 글로벌 변수
const imageModal = document.getElementById('image-modal');
const modalImg = document.getElementById('modal-img');
const modalTitle = document.getElementById('modal-title');
const closeModalBtn = document.getElementById('close-modal');
let activeModalSocketId = null; // 현재 전체화면 보기 중인 학생의 소켓 ID

function openFullscreenModal(socketId, pcNumber) {
  activeModalSocketId = socketId;
  modalTitle.textContent = `PC ${pcNumber} 실시간 관제 화면`;
  
  const card = activeCards[socketId];
  if (card) {
    const origImg = card.querySelector('.screen-img');
    if (origImg) {
      modalImg.src = origImg.src;
    }
  }
  imageModal.style.display = 'flex';
}

function closeFullscreenModal() {
  activeModalSocketId = null;
  imageModal.style.display = 'none';
  modalImg.src = '';
}

// 닫기 바인딩
if (closeModalBtn) closeModalBtn.addEventListener('click', closeFullscreenModal);
if (imageModal) {
  imageModal.addEventListener('click', (e) => {
    if (e.target === imageModal) {
      closeFullscreenModal();
    }
  });
}


// 1. 소켓 연결 핸들러
socket.on('connect', () => {
  console.log('[Dashboard] 서버 소켓 연결 성공:', socket.id);
  // 대시보드로 역할 등록
  socket.emit('register_dashboard');
});

// 2. 소켓 이벤트 수신
// 최초 로드 시 전체 학생 목록
socket.on('student_list', (studentList) => {
  console.log('[Dashboard] 학생 목록 로드됨:', studentList);
  studentsGrid.innerHTML = '';
  
  if (studentList.length === 0) {
    showEmptyState();
  } else {
    studentList.forEach(student => {
      renderStudentCard(student);
    });
  }
  updateStats();
});

// 신규 학생 접속
socket.on('student_connected', (student) => {
  console.log('[Dashboard] 학생 접속:', student);
  // 기존에 그려진 '대기 중' 안내 메시지 제거
  const emptyState = studentsGrid.querySelector('.no-students');
  if (emptyState) {
    studentsGrid.innerHTML = '';
  }
  
  renderStudentCard(student);
  updateStats();
});

// 학생 접속 종료
socket.on('student_disconnected', (data) => {
  console.log('[Dashboard] 학생 연결 해제:', data);
  const card = activeCards[data.socket_id];
  if (card) {
    card.classList.add('offline');
    
    // 오프라인 암전 디밍 및 경고 레이어 오버레이 생성
    const feed = card.querySelector('.screen-feed');
    if (feed && !feed.querySelector('.offline-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'offline-overlay';
      overlay.setAttribute('style', 'position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.75); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#ef4444; font-weight:800; font-size:0.85rem; gap:0.4rem; z-index:5;');
      overlay.innerHTML = '<i data-lucide="wifi-off" style="width:1.5rem; height:1.5rem;"></i><span>통신 두절 (OFFLINE)</span>';
      feed.appendChild(overlay);
      
      const img = feed.querySelector('.screen-img');
      if (img) img.style.filter = 'brightness(0.3) grayscale(0.8)';
      
      lucide.createIcons();
    }
    
    // 프로세스 리스트 초기화
    const procListDiv = card.querySelector('.process-list');
    if (procListDiv) {
      procListDiv.innerHTML = '<span class="no-bad-apps"><i data-lucide="alert-triangle" style="width:0.8rem;height:0.8rem;"></i>통신 두절됨</span>';
      lucide.createIcons();
    }
  }
  updateStats();
});

// 화면 업데이트
socket.on('screen_data', (data) => {
  const card = activeCards[data.socket_id];
  if (card) {
    // 오프라인 상태였다면 해제
    if (card.classList.contains('offline')) {
      card.classList.remove('offline');
      const overlay = card.querySelector('.offline-overlay');
      if (overlay) overlay.remove();
      
      const img = card.querySelector('.screen-img');
      if (img) img.style.filter = 'none';
    }
    
    const imgElement = card.querySelector('.screen-img');
    const placeholder = card.querySelector('.screen-placeholder');
    
    if (imgElement) {
      imgElement.src = data.image;
      imgElement.style.opacity = 1;
    }
    
    // 만약 현재 이 학생 화면이 전체화면 확대 모달로 켜져 있다면, 모달 이미지도 동시 실시간 갱신!
    if (activeModalSocketId === data.socket_id && modalImg) {
      modalImg.src = data.image;
    }
    
    if (placeholder) {
      placeholder.style.display = 'none';
    }
  }
});

// 프로세스 목록 업데이트
socket.on('process_update', (data) => {
  const card = activeCards[data.socket_id];
  if (card) {
    const procListDiv = card.querySelector('.process-list');
    if (procListDiv) {
      procListDiv.innerHTML = '';
      const processes = data.processes || [];
      
      if (processes.length === 0) {
        procListDiv.innerHTML = '<span class="no-bad-apps"><i data-lucide="check-circle" style="width:0.8rem;height:0.8rem;color:#10b981;"></i>안심 상태 (딴짓 없음)</span>';
      } else {
        processes.forEach(proc => {
          const chip = document.createElement('div');
          chip.className = 'process-chip';
          // 윈도우 제목이 너무 길면 자름
          const displayTitle = proc.title.length > 12 ? proc.title.substring(0, 12) + '...' : proc.title;
          chip.innerHTML = `
            <span title="${proc.title} (${proc.name})">${displayTitle}</span>
            <button class="btn-kill" data-socket-id="${data.socket_id}" data-proc-name="${proc.name}" title="종료 명령 전송">
              <i data-lucide="x"></i>
            </button>
          `;
          
          // 강제 종료 버튼 바인딩
          chip.querySelector('.btn-kill').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const targetSocketId = btn.getAttribute('data-socket-id');
            const processName = btn.getAttribute('data-proc-name');
            
            // 시각적 피드백 제공 (버튼 회전 및 투명도)
            btn.style.opacity = '0.5';
            btn.disabled = true;
            
            console.log(`[Dashboard] 강제 종료 이벤트 전송: ${targetSocketId} -> ${processName}`);
            socket.emit('kill_process', { targetSocketId, processName });
          });
          
          procListDiv.appendChild(chip);
        });
      }
      // 아이콘 새로고침
      lucide.createIcons();
    }
  }
});

// 3. 학생 카드 렌더링 함수
function renderStudentCard(student) {
  // 이미 생성된 카드가 있다면 재사용하고 상태만 갱신
  if (activeCards[student.socket_id]) {
    const existingCard = activeCards[student.socket_id];
    existingCard.classList.remove('offline');
    const overlay = existingCard.querySelector('.offline-overlay');
    if (overlay) overlay.remove();
    const img = existingCard.querySelector('.screen-img');
    if (img) img.style.filter = 'none';
    
    const nameEl = existingCard.querySelector('.student-name');
    if (nameEl) nameEl.textContent = `PC ${student.pc_number}`;
    return;
  }

  // 카드 컴포넌트 동적 생성
  const card = document.createElement('div');
  card.className = 'student-card';
  card.id = `card-${student.socket_id}`;
  card.setAttribute('data-pc-number', student.pc_number); // 오름차순 정렬용 속성
  
  card.innerHTML = `
    <!-- 카드 헤더 (공간 확보형 초슬림 디자인, 실시간 표시등 제거) -->
    <div class="card-header" style="padding: 0.35rem 0.6rem; min-height: auto; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); background: #f8fafc;">
      <div class="student-meta" style="display:flex; align-items:center;">
        <span class="student-name" style="font-size: 0.8rem; font-weight: 800; color: var(--text-main);">PC ${student.pc_number}</span>
      </div>
      <button class="btn-remove-pc" data-socket-id="${student.socket_id}" title="관제 목록에서 제거" style="background:none; border:none; color:var(--text-muted); cursor:pointer; display:flex; align-items:center; justify-content:center; padding:2px; border-radius:4px; transition:color 0.2s; outline:none;">
        <i data-lucide="trash-2" style="width:0.85rem; height:0.85rem;"></i>
      </button>
    </div>
    
    <!-- 화면 피드 영역 -->
    <div class="screen-feed">
      <div class="screen-placeholder">
        <i data-lucide="loader" class="animate-spin" style="animation: spin 1.5s linear infinite;"></i>
        <span>첫 화면 대기 중</span>
      </div>
      <img src="" alt="Student Screen" class="screen-img" style="opacity: 0;">
    </div>
    
    <!-- 카드 푸터 (프로세스 목록) -->
    <div class="card-footer">
      <span class="footer-title">의심스러운 실행 프로그램</span>
      <div class="process-list">
        <span class="no-bad-apps">
          <i data-lucide="loader" style="width:0.8rem;height:0.8rem;animation: spin 1.5s linear infinite;"></i>대기 중...
        </span>
      </div>
    </div>
  `;

  // 카드 제거 이벤트 바인딩
  card.querySelector('.btn-remove-pc').addEventListener('click', (e) => {
    e.stopPropagation();
    const sId = e.currentTarget.getAttribute('data-socket-id');
    console.log(`[Dashboard] 카드 강제 제거 요청: ${sId}`);
    
    // 소켓 서버에 제거 이벤트 요청 전송 (서버에서도 캐시 삭제)
    socket.emit('remove_student_request', { targetSocketId: sId });
    
    // 화면에서 즉각 제거
    const cardEl = activeCards[sId];
    if (cardEl) {
      cardEl.remove();
      delete activeCards[sId];
    }
    updateStats();
    if (Object.keys(activeCards).length === 0) {
      showEmptyState();
    }
  });

  // 전체화면 줌 토글 클릭 이벤트 바인딩
  const feed = card.querySelector('.screen-feed');
  if (feed) {
    feed.style.cursor = 'zoom-in';
    feed.addEventListener('click', () => {
      openFullscreenModal(student.socket_id, student.pc_number);
    });
  }

  studentsGrid.appendChild(card);
  activeCards[student.socket_id] = card;
  
  // 정렬 재배치 실행
  sortStudentCards();
  
  lucide.createIcons();
}

// 4. 대기 상태 안내창 그리기
function showEmptyState() {
  const activeTab = document.querySelector('.tab-btn.active');
  if (!activeTab) {
    studentsGrid.innerHTML = `
      <div class="no-students">
        <i data-lucide="monitor-off" class="empty-icon"></i>
        <p>관제 실습실 대기 중</p>
        <span class="empty-sub">상단의 AI융합실습실 탭 중 하나를 선택하면 관제 신호(비콘) 송출이 개시됩니다.</span>
      </div>
    `;
  } else {
    studentsGrid.innerHTML = `
      <div class="no-students">
        <i data-lucide="monitor-off" class="empty-icon"></i>
        <p>접속 대기 중...</p>
        <span class="empty-sub">학생 PC에서 프로그램을 실행해주세요.</span>
      </div>
    `;
  }
  lucide.createIcons();
}

// 4-2. PC 번호 오름차순 정렬 함수
function sortStudentCards() {
  const cardsArray = Array.from(studentsGrid.children);
  const studentCards = cardsArray.filter(card => card.classList.contains('student-card'));
  
  studentCards.sort((a, b) => {
    const numA = parseInt(a.getAttribute('data-pc-number') || '0', 10);
    const numB = parseInt(b.getAttribute('data-pc-number') || '0', 10);
    return numA - numB;
  });
  
  // 정렬된 순서대로 DOM 재배치
  studentCards.forEach(card => studentsGrid.appendChild(card));
}

// 5. 통계 정보 업데이트
function updateStats() {
  const cards = Object.values(activeCards);
  const total = cards.length;
  const online = cards.filter(card => !card.classList.contains('offline')).length;
  
  statTotal.textContent = total;
  statOnline.textContent = online;
}

// 6. 실습실 탭 선택 이벤트 (탭 클릭은 단순 알림용이므로 아무 작동 안 함)
tabBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

// 톱니바퀴 ⚙️ 클릭 시 윈도우 네이티브 설정 대화창 호출 (학생용 setup과 동일)
btnConfigClassroom.addEventListener('click', async () => {
  btnConfigClassroom.style.opacity = '0.5';
  btnConfigClassroom.disabled = true;
  
  try {
    const response = await fetch('/api/config/show-dialog', { method: 'POST' });
    const result = await response.json();
    if (result.success) {
      console.log(`[Dashboard] 네이티브 설정 창을 통한 실습실 변경 성공: ${result.classroom_id}`);
      
      // 탭 UI 하이라이트 동기화
      tabBtns.forEach(btn => {
        if (btn.getAttribute('data-room') === result.classroom_id) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      
      // 화면 리셋 및 상태 갱신
      studentsGrid.innerHTML = '';
      Object.keys(activeCards).forEach(key => delete activeCards[key]);
      showEmptyState();
      updateStats();
    }
  } catch (err) {
    console.error('설정 대화창 로드 실패:', err);
  } finally {
    btnConfigClassroom.style.opacity = '1';
    btnConfigClassroom.disabled = false;
  }
});

// 초기 로드 시 현재 서버에 설정된 실습실 조회 및 탭 활성화
async function loadCurrentClassroom() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    if (config && config.classroom_id) {
      tabBtns.forEach(btn => {
        if (btn.getAttribute('data-room') === config.classroom_id) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    } else {
      console.log('[Dashboard] 미설정 상태 - 탭 대기 모드');
      tabBtns.forEach(btn => btn.classList.remove('active'));
    }
    showEmptyState();
  } catch (err) {
    console.error('초기 실습실 로드 실패:', err);
    showEmptyState();
  }
}
loadCurrentClassroom();

// 아이콘 렌더링
lucide.createIcons();



