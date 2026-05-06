// ============================================================================
// Ledgerline — global state store backed by localStorage
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { uid, nowISO, todayISO } from './utils';
import { seed } from './seed';

const STORAGE_KEY = 'ledgerline.state.v1';

// ----------- State shape -----------------
//   profile:          { businessName, abn, fyStartMonth, currency, fontSize }
//   onboarded:        bool
//   currentUserId:    id of active user
//   users:            [{ id, name, email, role: admin|accountant|read-only }]
//   accounts:         [{ id, name, type: bank|credit|savings|crypto|investment|super,
//                        currency, balance, lastSynced, institution }]
//   transactions:     [{ id, accountId, date, payee, amount (signed), category, memo, reconciled, gst }]
//   recurring:        [{ id, accountId, payee, amount, category, freq, nextDate }]
//   budgets:          { 'YYYY-MM': { categoryId: amount } }
//   categories:       [{ id, name, kind: expense|income }]
//   debts:            [{ id, name, balance, apr, min, type }]
//   creditScores:     [{ id, bureau, score, date }]
//   chartOfAccounts:  [{ id, code, name, type, subType, gst, active }]
//   journalEntries:   [{ id, date, ref, memo, status, lines: [{accountId,debit,credit,gst,description}], createdAt, createdBy }]
//   bankReconciliations: [{ accountId, statementDate, statementBalance, items: [...] }]
//   bas:              [{ id, period, status, fields: { G1..G20 }, lodgedDate }]
//   ap:               [{ id, supplier, invoiceNo, date, dueDate, amount, paid, status, items, gst }]
//   ar:               [{ id, customer, invoiceNo, date, dueDate, amount, paid, status, items, gst }]
//   employees:        [{ id, name, email, role, type: casual|part-time|full-time, startDate, baseRate, super% }]
//   payRuns:          [{ id, period, payslips: [{employeeId, gross, paygWithheld, super, net, hours}] }]
//   superContribs:    [{ id, employeeId, type: concessional|non-concessional|fhss, amount, date }]
//   cgtAssets:        [{ id, name, kind: shares|property|crypto, qty, costBase, acquired, sold, proceeds }]
//   fbtItems:         [{ id, employeeId, type, taxableValue, type1, fbtYear }]
//   depAssets:        [{ id, name, cost, residual, lifeYears, method, acquired, bookValue }]
//   taxDeadlines:     [{ id, label, dueDate, lodged, kind }]
//   leaveBalances:    { employeeId: { annual, personal, longService, compassionate } }
//   leaveRequests:    [{ id, employeeId, type, from, to, days, status, reason }]
//   timesheets:       [{ id, employeeId, date, regularHrs, otHrs, notes }]
//   alertRules:       [{ id, name, kind, params, severity, enabled }]
//   alertEvents:      [{ id, ruleId, message, severity, createdAt, dismissed }]
//   chatHistory:      [{ id, role: user|bot, content, ts }]
//   audit:            [{ id, ts, userId, action, entity, entityId, summary }]
//   portfolio:        [{ id, ticker, name, qty, avgCost, currency, type: stock|etf|crypto }]
//   watchlist:        [{ id, ticker, name }]
//   marketPrices:     { TICKER: { price, change, history: [...] } }
//   options:          [{ ticker, strike, expiry, type, bid, ask }]
//   newsFeed:         [{ id, title, source, ts, url, ticker }]

const initial = seed();

function reducer(state, action) {
  const a = action;
  switch (a.type) {
    case 'HYDRATE': return { ...state, ...a.payload };
    case 'SET_PROFILE':
      return { ...state, profile: { ...state.profile, ...a.payload } };
    case 'SET_ONBOARDED': return { ...state, onboarded: a.payload };
    case 'SET_CURRENT_USER': return { ...state, currentUserId: a.payload };

    case 'COLLECTION_ADD':
      return { ...state, [a.collection]: [...(state[a.collection] || []), a.item] };
    case 'COLLECTION_UPDATE':
      return { ...state, [a.collection]: state[a.collection].map(x => x.id === a.id ? { ...x, ...a.patch } : x) };
    case 'COLLECTION_REPLACE':
      return { ...state, [a.collection]: a.items };
    case 'COLLECTION_REMOVE':
      return { ...state, [a.collection]: state[a.collection].filter(x => x.id !== a.id) };

    case 'SET_BUDGET':
      return { ...state, budgets: { ...state.budgets, [a.month]: a.payload } };

    case 'AUDIT':
      return { ...state, audit: [a.payload, ...state.audit].slice(0, 500) };

    case 'PRICE_TICK': {
      const next = { ...state.marketPrices };
      for (const t of Object.keys(next)) {
        const p = next[t];
        const drift = (Math.random() - 0.5) * 0.012;
        const newPrice = Math.max(0.01, p.price * (1 + drift));
        const change = newPrice - p.openPrice;
        const hist = (p.history || []).concat([newPrice]).slice(-90);
        next[t] = { ...p, price: newPrice, change, history: hist };
      }
      return { ...state, marketPrices: next };
    }

    case 'CHAT_APPEND':
      return { ...state, chatHistory: [...state.chatHistory, a.payload] };
    case 'CHAT_CLEAR':
      return { ...state, chatHistory: [] };

    case 'RESET_ALL':
      return seed();

    default:
      return state;
  }
}

const StoreContext = createContext(null);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    const stored = loadState();
    if (stored && stored.profile && stored._v === 1) return stored;
    return { ...initial, _v: 1 };
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }, [state]);

  // Live market price ticking when window has focus
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') dispatch({ type: 'PRICE_TICK' });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const audit = useCallback((action, entity, summary, entityId) => {
    dispatch({
      type: 'AUDIT',
      payload: {
        id: uid('aud'), ts: nowISO(),
        userId: state.currentUserId, action, entity, entityId, summary,
      },
    });
  }, [state.currentUserId]);

  const helpers = useMemo(() => ({
    add: (collection, item, withId = true) => {
      const it = withId && !item.id ? { ...item, id: uid(collection.slice(0, 3)) } : item;
      dispatch({ type: 'COLLECTION_ADD', collection, item: it });
      return it;
    },
    update: (collection, id, patch) => dispatch({ type: 'COLLECTION_UPDATE', collection, id, patch }),
    replace: (collection, items) => dispatch({ type: 'COLLECTION_REPLACE', collection, items }),
    remove: (collection, id) => dispatch({ type: 'COLLECTION_REMOVE', collection, id }),
    setBudget: (month, payload) => dispatch({ type: 'SET_BUDGET', month, payload }),
    setProfile: (payload) => dispatch({ type: 'SET_PROFILE', payload }),
    setOnboarded: (v) => dispatch({ type: 'SET_ONBOARDED', payload: v }),
    setCurrentUser: (id) => dispatch({ type: 'SET_CURRENT_USER', payload: id }),
    chatAppend: (msg) => dispatch({ type: 'CHAT_APPEND', payload: { id: uid('msg'), ts: nowISO(), ...msg } }),
    chatClear: () => dispatch({ type: 'CHAT_CLEAR' }),
    resetAll: () => dispatch({ type: 'RESET_ALL' }),
    audit,
  }), [audit]);

  const value = useMemo(() => ({ state, ...helpers }), [state, helpers]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

// Convenience selectors
export function useCurrentUser() {
  const { state } = useStore();
  return state.users.find(u => u.id === state.currentUserId) || state.users[0];
}

export function useCanWrite() {
  const u = useCurrentUser();
  return u && u.role !== 'read-only';
}
