// LocalStorage-first ShareCal with Batch Sync to Firestore
// Firestore is used for batch sync on demand

// --- Firebase Setup ---
const firebaseConfig = {
  apiKey: "AIzaSyCA7ZE9_gUH4x10yON6iTFXqyjRRFWPP8k",
  authDomain: "expense-c43bc.firebaseapp.com",
  projectId: "expense-c43bc",
  storageBucket: "expense-c43bc.firebasestorage.app",
  messagingSenderId: "22498177988",
  appId: "1:22498177988:web:cb9adec705ba38b37bea91"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- LocalStorage Helpers ---
function getLocalGroups() {
  const raw = JSON.parse(localStorage.getItem('sharecal_groups') || '[]');
  // Patch old data: add deleted/synced if missing
  return raw.map(g => ({
    ...g,
    deleted: typeof g.deleted === 'boolean' ? g.deleted : false,
    synced: typeof g.synced === 'boolean' ? g.synced : false
  }));
}
function setLocalGroups(groups) {
  localStorage.setItem('sharecal_groups', JSON.stringify(groups));
}
function getLocalExpenses() {
  const raw = JSON.parse(localStorage.getItem('sharecal_expenses') || '[]');
  // Patch old data: add deleted/synced/settled if missing
  return raw.map(e => ({
    ...e,
    deleted: typeof e.deleted === 'boolean' ? e.deleted : false,
    synced: typeof e.synced === 'boolean' ? e.synced : false,
    settled: typeof e.settled === 'boolean' ? e.settled : false
  }));
}
function setLocalExpenses(expenses) {
  localStorage.setItem('sharecal_expenses', JSON.stringify(expenses));
}

// --- UI State ---
const groupSelect = document.getElementById('group-select');
const createGroupForm = document.getElementById('create-group-form');
const groupNameInput = document.getElementById('group-name');
const groupMembersInput = document.getElementById('group-members');
const deleteGroupBtn = document.getElementById('delete-group-btn');
const editGroupBtn = document.getElementById('edit-group-btn');
const syncBtn = document.getElementById('sync-btn');
const loadFromCloudBtn = document.getElementById('load-from-cloud-btn');
let currentGroupId = null;
let currentGroupName = '';
let currentGroupMembers = [];

// Modal elements
const modalOverlay = document.getElementById('modal-overlay');
const editExpenseModal = document.getElementById('edit-expense-modal');
const editExpenseForm = document.getElementById('edit-expense-form');
const confirmDeleteModal = document.getElementById('confirm-delete-modal');
const confirmDeleteTitle = document.getElementById('confirm-delete-title');
const confirmDeleteMessage = document.getElementById('confirm-delete-message');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const cancelEditExpenseBtn = document.getElementById('cancel-edit-expense');

let deleteTarget = null;
let deleteType = null;
let editExpenseId = null;

// Expense form elements
const paidBySelect = document.getElementById('paidBy');
const splitAmongSelect = document.getElementById('splitAmong');
const editPaidBySelect = document.getElementById('edit-paidBy');
const editSplitAmongSelect = document.getElementById('edit-splitAmong');

const expenseForm = document.getElementById('expense-form');
const expensesList = document.getElementById('expenses-list');
let expenses = [];

// FAB and Add Expense Modal logic
const addExpenseBtn = document.getElementById('add-expense-btn');
const settlementBtn = document.getElementById('settlement-btn');
const addExpenseModal = document.getElementById('add-expense-modal');
const settlementModal = document.getElementById('settlement-modal');
const editGroupModal = document.getElementById('edit-group-modal');
const cancelAddExpenseBtn = document.getElementById('cancel-add-expense');
const closeSettlementBtn = document.getElementById('close-settlement-btn');
const cancelEditGroupBtn = document.getElementById('cancel-edit-group');
const editGroupForm = document.getElementById('edit-group-form');

function showAddExpenseModal() {
  modalOverlay.style.display = '';
  addExpenseModal.style.display = '';
}

function hideAddExpenseModal() {
  addExpenseModal.style.display = 'none';
  modalOverlay.style.display = 'none';
}

function showSettlementModal() {
  modalOverlay.style.display = '';
  settlementModal.style.display = '';
  loadSettlementList();
}

function hideSettlementModal() {
  settlementModal.style.display = 'none';
  modalOverlay.style.display = 'none';
}

function showEditGroupModal() {
  if (!currentGroupId) return;
  document.getElementById('edit-group-name').value = currentGroupName;
  document.getElementById('edit-group-members').value = currentGroupMembers.join(', ');
  modalOverlay.style.display = '';
  editGroupModal.style.display = '';
}

function hideEditGroupModal() {
  editGroupModal.style.display = 'none';
  modalOverlay.style.display = 'none';
}

addExpenseBtn.onclick = showAddExpenseModal;
settlementBtn.onclick = showSettlementModal;
cancelAddExpenseBtn.onclick = hideAddExpenseModal;
closeSettlementBtn.onclick = hideSettlementModal;
cancelEditGroupBtn.onclick = hideEditGroupModal;

modalOverlay.onclick = () => {
  hideAddExpenseModal();
  hideSettlementModal();
  hideEditGroupModal();
  hideModal(editExpenseModal);
  hideModal(confirmDeleteModal);
};

// --- GROUPS ---
function loadGroups() {
  const groups = getLocalGroups().filter(g => !g.deleted);
  groupSelect.innerHTML = '';
  groups.forEach(group => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name;
    option.dataset.members = JSON.stringify(group.members || '[]');
    groupSelect.appendChild(option);
  });
  
  // Select the current group if it exists, otherwise select the latest group
  if (currentGroupId && Array.from(groupSelect.options).some(o => o.value === currentGroupId)) {
    // Find and select the current group
    const currentOption = Array.from(groupSelect.options).find(o => o.value === currentGroupId);
    if (currentOption) {
      currentOption.selected = true;
      currentGroupName = currentOption.text;
      currentGroupMembers = JSON.parse(currentOption.dataset.members || '[]');
    }
  } else if (groupSelect.options.length > 0) {
    // Auto-select the latest group (last in the list) if no current group or current group doesn't exist
    groupSelect.selectedIndex = groupSelect.options.length - 1;
    currentGroupId = groupSelect.value;
    currentGroupName = groupSelect.options[groupSelect.selectedIndex].text;
    currentGroupMembers = JSON.parse(groupSelect.options[groupSelect.selectedIndex].dataset.members || '[]');
  }
  
  // Update the UI with the selected group
  if (currentGroupId) {
    updateExpenseFormMembers();
    loadExpenses();
  }
}

createGroupForm.onsubmit = (e) => {
  e.preventDefault();
  const name = groupNameInput.value.trim();
  const members = groupMembersInput.value.split(',').map(m => m.trim()).filter(Boolean);
  if (!name || members.length === 0) return;
  const groups = getLocalGroups();
  const id = 'g_' + Date.now();
  groups.push({ id, name, members, synced: false });
  setLocalGroups(groups);
  groupNameInput.value = '';
  groupMembersInput.value = '';
  
  // Set the newly created group as current
  currentGroupId = id;
  currentGroupName = name;
  currentGroupMembers = members;
  
  // Reload groups and ensure the new group is selected
  loadGroups();
};

groupSelect.onchange = () => {
  currentGroupId = groupSelect.value;
  currentGroupName = groupSelect.options[groupSelect.selectedIndex].text;
  currentGroupMembers = JSON.parse(groupSelect.options[groupSelect.selectedIndex].dataset.members || '[]');
  updateExpenseFormMembers();
  loadExpenses();
};

function updateExpenseFormMembers() {
  paidBySelect.innerHTML = '';
  currentGroupMembers.forEach(member => {
    const opt = document.createElement('option');
    opt.value = member;
    opt.textContent = member;
    paidBySelect.appendChild(opt);
  });
  // Render checkboxes for splitAmong
  const splitDiv = document.getElementById('splitAmongCheckboxes');
  splitDiv.innerHTML = '';
  currentGroupMembers.forEach(member => {
    const id = 'split_' + member.replace(/\s+/g, '_');
    splitDiv.innerHTML += `<label style="margin-right:1em;"><input type="checkbox" name="splitAmong" value="${member}" id="${id}" checked> ${member}</label>`;
  });
  updateMemberPaidList();
}

deleteGroupBtn.onclick = () => {
  if (!currentGroupId) return;
  showConfirmDelete('group', currentGroupId, `Are you sure you want to delete the group "${currentGroupName}" and all its expenses?`);
};

editGroupBtn.onclick = showEditGroupModal;

editGroupForm.onsubmit = (e) => {
  e.preventDefault();
  if (!currentGroupId) return;
  
  const newName = document.getElementById('edit-group-name').value.trim();
  const newMembers = document.getElementById('edit-group-members').value.split(',').map(m => m.trim()).filter(Boolean);
  
  if (!newName || newMembers.length === 0) {
    alert('Please fill all fields.');
    return;
  }
  
  let groups = getLocalGroups();
  groups = groups.map(g => g.id === currentGroupId ? { ...g, name: newName, members: newMembers, synced: false } : g);
  setLocalGroups(groups);
  currentGroupName = newName;
  currentGroupMembers = newMembers;
  updateExpenseFormMembers();
  loadGroups();
  hideEditGroupModal();
};

// --- EXPENSES ---
expenseForm.onsubmit = (e) => {
  e.preventDefault();
  if (!currentGroupId) {
    alert('Please select or create a group first!');
    return;
  }
  const desc = document.getElementById('desc').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const paidBy = paidBySelect.value;
  const splitAmong = Array.from(document.querySelectorAll('#splitAmongCheckboxes input[name="splitAmong"]:checked')).map(cb => cb.value);
  if (!desc || !amount || !paidBy || splitAmong.length === 0) {
    alert('Please fill all fields.');
    return;
  }
  const allExpenses = getLocalExpenses();
  const id = 'e_' + Date.now();
  allExpenses.push({ id, groupId: currentGroupId, desc, amount, paidBy, splitAmong, synced: false });
  setLocalExpenses(allExpenses);
  expenseForm.reset();
  updateExpenseFormMembers(); // re-check all by default
  loadExpenses();
};

function loadExpenses() {
  if (!currentGroupId) return;
  const allExpenses = getLocalExpenses().filter(e => !e.deleted);
  expenses = allExpenses.filter(e => e.groupId === currentGroupId);
  expensesList.innerHTML = '';
  expenses.forEach(exp => {
    const settledStatus = exp.settled ? '✅' : '⏳';
    const settledClass = exp.settled ? 'style="opacity:0.6;text-decoration:line-through;"' : '';
    expensesList.innerHTML += `
      <li data-id="${exp.id}">
        <div style="display:flex;align-items:center;gap:0.5em;flex-wrap:wrap;">
          <span ${settledClass}>${exp.desc}</span>
          <span style="font-size:0.9em;color:var(--muted);">${settledStatus}</span>
          <button class="edit-expense-btn" data-id="${exp.id}" title="Edit">✏️</button>
          <button class="delete-expense-btn" data-id="${exp.id}" title="Delete">🗑️</button>
        </div>
        <span ${settledClass}>₹${exp.amount} <span style="color:#888;">|</span> Paid by: ${exp.paidBy} <span style="color:#888;">|</span> Split among: ${exp.splitAmong.join(', ')}</span>
      </li>
    `;
  });
  document.querySelectorAll('.edit-expense-btn').forEach(btn => {
    btn.onclick = (e) => openEditExpenseModal(btn.getAttribute('data-id'));
  });
  document.querySelectorAll('.delete-expense-btn').forEach(btn => {
    btn.onclick = (e) => showConfirmDelete('expense', btn.getAttribute('data-id'), 'Are you sure you want to delete this expense?');
  });
  updateSettleUp();
  updateMemberPaidList();
}

// --- EDIT/DELETE EXPENSES ---
function openEditExpenseModal(expenseId) {
  const exp = expenses.find(e => e.id === expenseId);
  if (!exp) return;
  editExpenseId = expenseId;
  document.getElementById('edit-desc').value = exp.desc;
  document.getElementById('edit-amount').value = exp.amount;
  editPaidBySelect.innerHTML = '';
  currentGroupMembers.forEach(member => {
    const opt = document.createElement('option');
    opt.value = member;
    opt.textContent = member;
    editPaidBySelect.appendChild(opt);
  });
  editPaidBySelect.value = exp.paidBy;
  // Render checkboxes for edit splitAmong
  const editSplitDiv = document.getElementById('edit-splitAmongCheckboxes');
  editSplitDiv.innerHTML = '';
  currentGroupMembers.forEach(member => {
    const id = 'edit_split_' + member.replace(/\s+/g, '_');
    const checked = exp.splitAmong.includes(member) ? 'checked' : '';
    editSplitDiv.innerHTML += `<label style="margin-right:1em;"><input type="checkbox" name="editSplitAmong" value="${member}" id="${id}" ${checked}> ${member}</label>`;
  });
  showModal(editExpenseModal);
}

editExpenseForm.onsubmit = (e) => {
  e.preventDefault();
  if (!editExpenseId) return;
  const desc = document.getElementById('edit-desc').value;
  const amount = parseFloat(document.getElementById('edit-amount').value);
  const paidBy = editPaidBySelect.value;
  const splitAmong = Array.from(document.querySelectorAll('#edit-splitAmongCheckboxes input[name="editSplitAmong"]:checked')).map(cb => cb.value);
  if (!desc || !amount || !paidBy || splitAmong.length === 0) {
    alert('Please fill all fields.');
    return;
  }
  let allExpenses = getLocalExpenses();
  allExpenses = allExpenses.map(e => e.id === editExpenseId ? { ...e, desc, amount, paidBy, splitAmong, synced: false } : e);
  setLocalExpenses(allExpenses);
  hideModal(editExpenseModal);
  editExpenseId = null;
  loadExpenses();
};

cancelEditExpenseBtn.onclick = () => {
  hideModal(editExpenseModal);
  editExpenseId = null;
};

function showConfirmDelete(type, id, message) {
  deleteTarget = id;
  deleteType = type;
  confirmDeleteTitle.textContent = 'Confirm Delete';
  confirmDeleteMessage.textContent = message;
  showModal(confirmDeleteModal);
}

confirmDeleteBtn.onclick = () => {
  if (deleteType === 'expense') {
    let allExpenses = getLocalExpenses();
    allExpenses = allExpenses.map(e => e.id === deleteTarget ? { ...e, deleted: true, synced: false } : e);
    setLocalExpenses(allExpenses);
    loadExpenses();
  } else if (deleteType === 'group') {
    let groups = getLocalGroups();
    groups = groups.map(g => g.id === deleteTarget ? { ...g, deleted: true, synced: false } : g);
    setLocalGroups(groups);
    let allExpenses = getLocalExpenses();
    allExpenses = allExpenses.map(e => e.groupId === deleteTarget ? { ...e, deleted: true, synced: false } : e);
    setLocalExpenses(allExpenses);
    currentGroupId = null;
    currentGroupName = '';
    currentGroupMembers = [];
    groupSelect.selectedIndex = -1;
    updateExpenseFormMembers();
    expensesList.innerHTML = '';
    updateSettleUp();
    loadGroups();
  }
  hideModal(confirmDeleteModal);
  deleteTarget = null;
  deleteType = null;
};

cancelDeleteBtn.onclick = () => {
  hideModal(confirmDeleteModal);
  deleteTarget = null;
  deleteType = null;
};

function showModal(modal) {
  modalOverlay.style.display = '';
  modal.style.display = '';
}

function hideModal(modal) {
  modalOverlay.style.display = 'none';
  modal.style.display = 'none';
}

// --- SETTLE UP CALCULATION ---
const settleUpList = document.getElementById('settle-up-list');
function updateSettleUp() {
  // Calculate net balance for each participant
  const balances = {};
  expenses.forEach(exp => {
    const share = exp.amount / exp.splitAmong.length;
    exp.splitAmong.forEach(person => {
      balances[person] = (balances[person] || 0) - share;
    });
    balances[exp.paidBy] = (balances[exp.paidBy] || 0) + exp.amount;
  });
  // Minimize transactions (greedy)
  const people = Object.keys(balances);
  const creditors = people.filter(p => balances[p] > 0).sort((a,b) => balances[b]-balances[a]);
  const debtors = people.filter(p => balances[p] < 0).sort((a,b) => balances[a]-balances[b]);
  const transactions = [];
  let i = 0, j = 0;
  let bal = {...balances};
  while (i < creditors.length && j < debtors.length) {
    const cred = creditors[i], debt = debtors[j];
    const amount = Math.min(bal[cred], -bal[debt]);
    if (amount > 0.01) {
      // Create stable transaction ID based on debtor, creditor, and amount
      const transactionId = `t_${debt}_${cred}_${Math.round(amount * 100)}`;
      const settled = getSettlementStatus(transactionId);
      transactions.push({
        id: transactionId,
        debtor: debt,
        creditor: cred,
        amount: amount,
        settled: settled
      });
      bal[cred] -= amount;
      bal[debt] += amount;
    }
    if (Math.abs(bal[cred]) < 0.01) i++;
    if (Math.abs(bal[debt]) < 0.01) j++;
  }
  const settleUpList = document.getElementById('settle-up-list');
  if (transactions.length) {
    const allSettled = transactions.every(t => t.settled);
    settleUpList.innerHTML = transactions.map(t => {
      const statusIcon = t.settled ? '✅' : '⏳';
      const settledClass = t.settled ? 'style="opacity:0.6;text-decoration:line-through;"' : '';
      return `<li title="Let's settle!" ${settledClass}>${statusIcon} ${t.debtor} pays ₹${t.amount.toFixed(2)} to ${t.creditor}</li>`;
    }).join('');
    // Remove any all-settled message if there are still pending transactions
    const allSettledElement = document.querySelector('#settle-up-section .all-settled');
    if (allSettledElement) allSettledElement.remove();
    
    // Show all settled message if all transactions are paid
    if (allSettled && !document.querySelector('#settle-up-section .all-settled')) {
      const msg = document.createElement('div');
      msg.className = 'all-settled';
      msg.innerHTML = '🎉 All settled up! <span title="Great job!">🥳</span>';
      document.getElementById('settle-up-section').appendChild(msg);
      showConfetti();
    }
  } else {
    settleUpList.innerHTML = '';
    // Fun emoji and confetti
    if (!document.querySelector('#settle-up-section .all-settled')) {
      const msg = document.createElement('div');
      msg.className = 'all-settled';
      msg.innerHTML = '🎉 All settled up! <span title="Great job!">🥳</span>';
      document.getElementById('settle-up-section').appendChild(msg);
      showConfetti();
    }
  }
}

// --- SYNC BUTTON ---
syncBtn.onclick = async () => {
  if (!navigator.onLine) {
    alert('You are offline. Please connect to the internet to sync.');
    return;
  }
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';
  try {
    await autoSync();
    alert('Sync complete!');
  } catch (err) {
    alert('Sync failed: ' + err.message);
  }
  syncBtn.disabled = false;
  syncBtn.textContent = 'Sync to Cloud';
};

// --- AUTO-SYNC FUNCTIONALITY ---
async function autoSync() {
  if (!navigator.onLine) return;
  
  try {
    // Upload local changes to Firebase
    let groups = getLocalGroups();
    const unsyncedGroups = groups.filter(g => !g.synced || g.deleted);
    if (unsyncedGroups.length > 0) {
      const groupBatch = db.batch();
      unsyncedGroups.forEach(g => {
        const ref = db.collection('groups').doc(g.id);
        if (g.deleted) {
          groupBatch.delete(ref);
        } else {
          groupBatch.set(ref, { name: g.name, members: g.members, deleted: !!g.deleted });
        }
      });
      await groupBatch.commit();
    }
    
    let allExpenses = getLocalExpenses();
    const unsyncedExpenses = allExpenses.filter(e => !e.synced || e.deleted);
    if (unsyncedExpenses.length > 0) {
      const expenseBatch = db.batch();
      unsyncedExpenses.forEach(e => {
        const ref = db.collection('expenses').doc(e.id);
        if (e.deleted) {
          expenseBatch.delete(ref);
        } else {
          expenseBatch.set(ref, { groupId: e.groupId, desc: e.desc, amount: e.amount, paidBy: e.paidBy, splitAmong: e.splitAmong, deleted: !!e.deleted });
        }
      });
      await expenseBatch.commit();
    }
    
    // Mark as synced
    if (unsyncedGroups.length > 0 || unsyncedExpenses.length > 0) {
      groups = getLocalGroups().filter(g => !g.deleted).map(g => ({ ...g, synced: true }));
      allExpenses = getLocalExpenses().filter(e => !e.deleted).map(e => ({ ...e, synced: true }));
      setLocalGroups(groups);
      setLocalExpenses(allExpenses);
      console.log('Auto-sync completed');
    }
    
  } catch (err) {
    console.error('Auto-sync failed:', err);
  }
}

// Utility: get color for a member (hash to color)
function getAvatarColor(name) {
  const colors = [
    '#60a5fa', '#fbbf24', '#34d399', '#f87171', '#a78bfa', '#f472b6', '#facc15', '#38bdf8', '#f472b6', '#a3e635', '#f87171', '#fbbf24'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase();
}

function updateMemberPaidList() {
  const memberPaidList = document.getElementById('member-paid-list');
  if (!currentGroupMembers || currentGroupMembers.length === 0) {
    memberPaidList.innerHTML = '<li>No members</li>';
    return;
  }
  // Calculate total paid by each member
  const paidTotals = {};
  currentGroupMembers.forEach(m => paidTotals[m] = 0);
  expenses.forEach(exp => {
    if (paidTotals.hasOwnProperty(exp.paidBy)) {
      paidTotals[exp.paidBy] += Number(exp.amount) || 0;
    }
  });
  memberPaidList.innerHTML = currentGroupMembers.map(m => `
    <li class="member-paid-item" title="${m} paid ₹${paidTotals[m].toFixed(2)}">
      <span class="member-avatar" style="background:${getAvatarColor(m)};">${getInitials(m)}</span>
      <span>${m}</span>
      <span class="member-paid-amount">₹${paidTotals[m].toFixed(2)}</span>
    </li>
  `).join('');
}

// Confetti animation
function showConfetti() {
  const confettiContainer = document.getElementById('confetti-container');
  confettiContainer.innerHTML = '';
  const colors = ['#60a5fa', '#fbbf24', '#34d399', '#f87171', '#a78bfa', '#f472b6', '#facc15', '#38bdf8'];
  for (let i = 0; i < 36; i++) {
    const div = document.createElement('div');
    div.className = 'confetti-piece';
    div.style.background = colors[Math.floor(Math.random() * colors.length)];
    div.style.left = Math.random() * 100 + 'vw';
    div.style.animationDelay = (Math.random() * 0.7) + 's';
    confettiContainer.appendChild(div);
  }
  setTimeout(() => { confettiContainer.innerHTML = ''; }, 2200);
}

// --- SETTLEMENT FUNCTIONALITY ---
function loadSettlementList() {
  if (!currentGroupId) return;
  const settlementList = document.getElementById('settlement-list');
  
  // Calculate settle-up transactions
  const balances = {};
  expenses.forEach(exp => {
    const share = exp.amount / exp.splitAmong.length;
    exp.splitAmong.forEach(person => {
      balances[person] = (balances[person] || 0) - share;
    });
    balances[exp.paidBy] = (balances[exp.paidBy] || 0) + exp.amount;
  });
  
  // Generate transactions
  const people = Object.keys(balances);
  const creditors = people.filter(p => balances[p] > 0).sort((a,b) => balances[b]-balances[a]);
  const debtors = people.filter(p => balances[p] < 0).sort((a,b) => balances[a]-balances[b]);
  const transactions = [];
  let i = 0, j = 0;
  let bal = {...balances};
  
  while (i < creditors.length && j < debtors.length) {
    const cred = creditors[i], debt = debtors[j];
    const amount = Math.min(bal[cred], -bal[debt]);
    if (amount > 0.01) {
      const transactionId = `t_${debt}_${cred}_${Math.round(amount * 100)}`;
      transactions.push({
        id: transactionId,
        debtor: debt,
        creditor: cred,
        amount: amount,
        settled: getSettlementStatus(transactionId)
      });
      bal[cred] -= amount;
      bal[debt] += amount;
    }
    if (Math.abs(bal[cred]) < 0.01) i++;
    if (Math.abs(bal[debt]) < 0.01) j++;
  }
  
  if (transactions.length === 0) {
    settlementList.innerHTML = '<p>🎉 All settled up! No payments needed.</p>';
    return;
  }
  
  settlementList.innerHTML = transactions.map(t => `
    <div class="settlement-item ${t.settled ? 'settled' : ''}" data-id="${t.id}">
      <div>
        <input type="checkbox" class="settlement-checkbox" ${t.settled ? 'checked' : ''} onchange="toggleSettlement('${t.id}')">
        <strong>${t.debtor}</strong> pays <strong>₹${t.amount.toFixed(2)}</strong> to <strong>${t.creditor}</strong>
      </div>
      <div style="font-size:0.9em;color:var(--muted);">
        ${t.settled ? '✅ Paid' : '⏳ Pending'}
      </div>
    </div>
  `).join('');
}

function getSettlementStatus(transactionId) {
  const settlements = JSON.parse(localStorage.getItem('sharecal_settlements') || '{}');
  return settlements[transactionId] || false;
}

function setSettlementStatus(transactionId, settled) {
  const settlements = JSON.parse(localStorage.getItem('sharecal_settlements') || '{}');
  settlements[transactionId] = settled;
  localStorage.setItem('sharecal_settlements', JSON.stringify(settlements));
}

function toggleSettlement(transactionId) {
  const currentStatus = getSettlementStatus(transactionId);
  setSettlementStatus(transactionId, !currentStatus);
  loadSettlementList();
  updateSettleUp();
}

// Make toggleSettlement globally accessible
window.toggleSettlement = toggleSettlement;

// --- LOAD DATA FROM FIREBASE ---
async function loadDataFromFirebase() {
  if (!navigator.onLine) {
    console.log('Offline - using local data only');
    return;
  }
  
  try {
    // Load groups from Firebase
    const groupsSnapshot = await db.collection('groups').get();
    const firebaseGroups = [];
    groupsSnapshot.forEach(doc => {
      const data = doc.data();
      if (!data.deleted) {
        firebaseGroups.push({
          id: doc.id,
          name: data.name,
          members: data.members || [],
          synced: true,
          deleted: false
        });
      }
    });
    
    // Load expenses from Firebase
    const expensesSnapshot = await db.collection('expenses').get();
    const firebaseExpenses = [];
    expensesSnapshot.forEach(doc => {
      const data = doc.data();
      if (!data.deleted) {
        firebaseExpenses.push({
          id: doc.id,
          groupId: data.groupId,
          desc: data.desc,
          amount: data.amount,
          paidBy: data.paidBy,
          splitAmong: data.splitAmong || [],
          synced: true,
          deleted: false,
          settled: false
        });
      }
    });
    
    // Save to localStorage
    if (firebaseGroups.length > 0) {
      setLocalGroups(firebaseGroups);
      console.log(`Loaded ${firebaseGroups.length} groups from Firebase`);
    }
    
    if (firebaseExpenses.length > 0) {
      setLocalExpenses(firebaseExpenses);
      console.log(`Loaded ${firebaseExpenses.length} expenses from Firebase`);
    }
    
    // Reload UI
    loadGroups();
    loadExpenses();
    
  } catch (err) {
    console.error('Failed to load data from Firebase:', err);
  }
}

// --- INIT ---
async function initializeApp() {
  // First load any existing local data
  loadGroups();
  
  // Check if we have any local data
  const localGroups = getLocalGroups();
  const localExpenses = getLocalExpenses();
  
  // Only auto-load from Firebase if no local data exists
  if (localGroups.length === 0 && localExpenses.length === 0) {
    console.log('No local data found - auto-loading from Firebase...');
    await loadDataFromFirebase();
  }
}

// Start the app
initializeApp(); 