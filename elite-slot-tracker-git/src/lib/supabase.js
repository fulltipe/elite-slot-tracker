import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xligrsnpanbouxyrknuh.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_bHEYAUkFVHPF1ojkSlyL_Q_JtwyGsBE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// La clé de sync identifie ton profil. Stockée en local, tu la colles sur chaque appareil.
const SYNC_KEY_STORAGE = 'elite_sync_key'

export function getSyncKey() {
  let k = localStorage.getItem(SYNC_KEY_STORAGE)
  return k || null
}

export function setSyncKey(k) {
  localStorage.setItem(SYNC_KEY_STORAGE, k)
}

export function generateSyncKey() {
  // Format lisible : 4 groupes de 4 caractères
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const grp = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `${grp()}-${grp()}-${grp()}-${grp()}`
}

// Récupère tout l'état depuis le cloud
export async function loadState(syncKey) {
  const { data, error } = await supabase.rpc('get_or_create_state', { p_sync_key: syncKey })
  if (error) throw error
  return data
}

// Sauvegarde tout l'état dans le cloud
export async function saveState(syncKey, state) {
  const { error } = await supabase.rpc('save_state', {
    p_sync_key: syncKey,
    p_config: state.config,
    p_provider_bet_scales: state.providerBetScales,
    p_prefs: state.prefs,
    p_machines: state.machines,
    p_hunts: state.hunts,
    p_saved_hunts: state.savedHuntQueue,
  })
  if (error) throw error
}

// Normalise les machines venant du serveur (snake_case -> camelCase)
export function normalizeMachine(m) {
  return {
    id: m.id,
    nom: m.nom,
    provider: m.provider,
    image: m.image || '',
    history: m.history || [],
    tentatives: m.tentatives || 0,
    totalGain: Number(m.total_gain) || 0,
    ia_weight: Number(m.ia_weight) || 1.0,
    fav: !!m.fav,
    bonusCount: m.bonus_count || 0,
    lastBonusDate: m.last_bonus_date || 'Jamais',
    playCount: m.play_count || 0,
    tags: m.tags || [],
    notes: m.notes || '',
    archived: !!m.archived,
  }
}

export function normalizeHunt(h) {
  return {
    id: h.id,
    date: h.date,
    cost: Number(h.cost) || 0,
    items: h.items || [],
    totalG: Number(h.total_g) || 0,
    net: Number(h.net) || 0,
    duration: h.duration || 0,
    practice: !!h.practice,
  }
}

export function normalizeSaved(s) {
  return {
    savedId: s.saved_id,
    date: s.date,
    cost: Number(s.cost) || 0,
    items: s.items || [],
  }
}
