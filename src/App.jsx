import { useState, useRef, useEffect, useCallback } from 'react'
import confetti from 'canvas-confetti'
import './App.css'

// --- Auth token management (stored in localStorage for persistence across sessions) ---
const TOKEN_KEY = 'cabane_admin_token'
const loadToken = () => localStorage.getItem(TOKEN_KEY)
const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token)
const clearToken = () => localStorage.removeItem(TOKEN_KEY)

// Auth header helper
const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
})

// Maple leaf confetti burst
const mapleLeafPath = confetti.shapeFromPath({
  path: 'M12 0 L14 8 L22 8 L16 13 L18 22 L12 17 L6 22 L8 13 L2 8 L10 8 Z',
})

const launchMapleConfetti = () => {
  const colors = ['#DAA520', '#CD853F', '#D2691E', '#B8860B', '#A0522D', '#E8A317']
  const end = Date.now() + 3500

  const frame = () => {
    if (Date.now() > end) return

    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors,
      shapes: [mapleLeafPath, 'circle'],
      scalar: 1.2,
      drift: 0.5,
      ticks: 200,
      gravity: 0.8,
    })

    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors,
      shapes: [mapleLeafPath, 'circle'],
      scalar: 1.2,
      drift: -0.5,
      ticks: 200,
      gravity: 0.8,
    })

    requestAnimationFrame(frame)
  }

  // Initial burst from center
  confetti({
    particleCount: 50,
    spread: 100,
    origin: { y: 0.65 },
    colors,
    shapes: [mapleLeafPath, 'circle'],
    scalar: 1.4,
    ticks: 250,
    gravity: 0.7,
    drift: 0,
  })

  frame()
}

// Local-only notification tracking (last-seen count is per-device, which is correct)
const NOTIF_LAST_COUNT_KEY = 'cabane_notif_last_count'
const loadNotifLastCount = () => parseInt(localStorage.getItem(NOTIF_LAST_COUNT_KEY) || '0', 10)
const saveNotifLastCount = (val) => localStorage.setItem(NOTIF_LAST_COUNT_KEY, String(val))

// localStorage key
const RESERVATIONS_KEY = 'cabane_reservations'

// Status options for reservations
const STATUT_OPTIONS = [
  'Réservé',
  'En traitement',
  'Prêt pour ramassage/livraison',
  'Client contacté',
  'Complété',
]

// Load reservations from localStorage
const loadReservations = () => {
  try {
    const data = localStorage.getItem(RESERVATIONS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

// Save reservations to localStorage
const saveReservations = (reservations) => {
  localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(reservations))
}

// --- Server API helpers (Netlify Functions + Blobs) ---

/** Save a new reservation (public — no auth needed) */
async function apiSaveReservation(reservation) {
  try {
    const res = await fetch('/.netlify/functions/save-reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reservation),
    })
    if (res.ok) return await res.json()
  } catch { /* fallback to localStorage only */ }
  return null
}

/** Admin login — returns JWT token or null */
async function apiLogin(password) {
  try {
    const res = await fetch('/.netlify/functions/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      const data = await res.json()
      return data.token
    }
    if (res.status === 401) return null
  } catch { /* network error */ }
  return null
}

/** Verify stored token is still valid */
async function apiVerifyToken(token) {
  try {
    const res = await fetch('/.netlify/functions/verify-token', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    return res.ok
  } catch { return false }
}

/** Get reservations (requires JWT) */
async function apiGetReservations(token) {
  try {
    const res = await fetch('/.netlify/functions/get-reservations', {
      headers: authHeaders(token),
    })
    if (res.ok) return await res.json()
    if (res.status === 401) return 'UNAUTHORIZED'
  } catch { /* fallback to localStorage */ }
  return null
}

/** Update reservation status (requires JWT) */
async function apiUpdateStatus(token, numero, statut) {
  try {
    await fetch('/.netlify/functions/update-status', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ numero, statut }),
    })
  } catch { /* localStorage already updated */ }
}

/** Delete reservations (requires JWT) */
async function apiDeleteReservations(token, numeros) {
  try {
    await fetch('/.netlify/functions/delete-reservations', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ numeros }),
    })
  } catch { /* localStorage already updated */ }
}

/** Get shared admin settings (requires JWT) */
async function apiGetSettings(token) {
  try {
    const res = await fetch('/.netlify/functions/admin-settings', {
      headers: authHeaders(token),
    })
    if (res.ok) return await res.json()
  } catch { /* use defaults */ }
  return null
}

/** Update shared admin settings (requires JWT) */
async function apiSaveSettings(token, settings) {
  try {
    const res = await fetch('/.netlify/functions/admin-settings', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(settings),
    })
    if (res.ok) return await res.json()
  } catch { /* best-effort */ }
  return null
}

/** Get security question (public — no auth) */
async function apiGetSecurityQuestion() {
  try {
    const res = await fetch('/.netlify/functions/security-question')
    if (res.ok) return await res.json()
  } catch { /* ignore */ }
  return null
}

/** Set security question + answer (requires JWT) */
async function apiSetSecurityQuestion(token, question, answer) {
  try {
    const res = await fetch('/.netlify/functions/security-question', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ question, answer }),
    })
    if (res.ok) return await res.json()
  } catch { /* ignore */ }
  return null
}

/** Reset password via security answer — returns JWT token or error */
async function apiResetPassword(answer) {
  try {
    const res = await fetch('/.netlify/functions/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    })
    const data = await res.json()
    if (res.ok) return { token: data.token }
    return { error: data.error || 'Erreur inconnue' }
  } catch { return { error: 'Erreur réseau' } }
}

/** Change admin password (requires JWT) */
async function apiChangePassword(token, currentPassword, newPassword) {
  try {
    const res = await fetch('/.netlify/functions/change-password', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    const data = await res.json()
    if (res.ok) return { success: true }
    return { error: data.error || 'Erreur inconnue' }
  } catch { return { error: 'Erreur réseau' } }
}

// Generate next reservation number
const getNextNumber = (reservations) => {
  if (reservations.length === 0) return 1
  const maxNum = Math.max(...reservations.map(r => r.numero))
  return maxNum + 1
}

// Format reservation number as #001
const formatNumero = (n) => `#${String(n).padStart(3, '0')}`

// Format date/time for display
const formatDateTime = (isoString) => {
  const d = new Date(isoString)
  return d.toLocaleString('fr-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Format produits array (or legacy categorie) into readable text
const formatProduits = (r) => {
  if (r.produits && Array.isArray(r.produits)) {
    return r.produits.map(p => p.nom).join(', ')
  }
  return r.categorie || ''
}

// Export reservations to CSV
const exportCSV = (reservations) => {
  const headers = [
    'Numéro',
    'Date et heure',
    'Nom du client',
    'Téléphone',
    'Courriel',
    'Produits',
    'Quantité',
    'Instructions spéciales',
    'Statut',
  ]
  const escape = (val) => {
    let str = String(val ?? '')
    // Prevent CSV formula injection
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
  const rows = reservations.map(r => [
    formatNumero(r.numero),
    formatDateTime(r.date),
    r.nom,
    r.telephone,
    r.courriel,
    formatProduits(r),
    r.produits && Array.isArray(r.produits) ? r.produits.map(p => p.quantite).join(', ') : '',
    r.instructions || '',
    r.statut,
  ].map(escape).join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reservations_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Product data
const PRODUCTS = {
  can: {
    id: 'can',
    name: 'Canne 540ml',
    fullName: "L'Or de la Forêt : Sirop d'érable pur",
    title: "« L'Authentique »",
  },
  case: {
    id: 'case',
    name: 'Caisse - 8 x 540ml',
    fullName: "La Réserve d'Hiver : Caisse de 8 cannes",
    title: '« La Réserve du Maître Sucrier »',
  }
}

// Recipe categories and data
const RECIPE_CATEGORIES = [
  { id: 'petit-dejeuner', label: 'Petit-Déjeuner', emoji: '🍳' },
  { id: 'lunch', label: 'Lunch', emoji: '🥗' },
  { id: 'souper', label: 'Souper', emoji: '🍽️' },
  { id: 'desserts', label: 'Desserts', emoji: '🍰' },
  { id: 'boissons-alcool', label: 'Boissons (Alcool)', emoji: '🥃' },
  { id: 'boissons-sans-alcool', label: 'Boissons (Sans Alcool)', emoji: '☕' },
]

const RECIPES = {
  'petit-dejeuner': [
    {
      title: 'Pain doré à l\'ancienne au sirop Ambré',
      grade: 'Ambré',
      ingredients: ['8 tranches de pain brioché', '3 œufs', '1 tasse de lait', '½ tasse de sirop Ambré'],
      instructions: 'Tremper chaque tranche de pain dans le mélange œufs-lait. Poêler au beurre à feu moyen jusqu\'à dorure. Servir nappé généreusement de sirop Ambré.',
      epicerie: ['Pain brioché', 'Œufs', 'Lait', 'Beurre'],
    },
    {
      title: 'Avoine épointée aux pommes et érable Doré',
      grade: 'Doré',
      ingredients: ['1 tasse d\'avoine épointée', '2 pommes', '½ tasse de sirop Doré'],
      instructions: 'Cuire l\'avoine 20 minutes à feu doux. Garnir de pommes sautées au beurre et cannelle. Arroser de sirop Doré au moment de servir.',
      epicerie: ['Avoine épointée', 'Pommes', 'Cannelle'],
    },
    {
      title: 'Shakshuka érable et feta',
      grade: 'Foncé',
      ingredients: ['1 boîte de tomates', '4 œufs', '100 g de feta', '3 c. à soupe de sirop Foncé'],
      instructions: 'Mijoter les tomates avec le sirop Foncé et les épices. Pocher les œufs directement dans la sauce. Émietter la feta sur le dessus et servir avec du pain croûté.',
      epicerie: ['Tomates en dés', 'Oignon', 'Feta'],
    },
  ],
  'lunch': [
    {
      title: 'Salade de betteraves et érable Ambré',
      grade: 'Ambré',
      ingredients: ['4 betteraves cuites', 'Roquette', 'Noix de Grenoble', 'Vinaigrette : sirop Ambré + moutarde de Dijon'],
      instructions: 'Trancher les betteraves. Disposer sur un lit de roquette. Parsemer de noix et napper de vinaigrette érable-Dijon. Servir frais.',
      epicerie: ['Betteraves', 'Roquette', 'Noix de Grenoble'],
    },
    {
      title: 'Brie fondant et érable Doré',
      grade: 'Doré',
      ingredients: ['1 baguette tranchée', 'Brie crémeux', '1 pomme', '¼ tasse de sirop Doré'],
      instructions: 'Garnir les tranches de baguette de brie et de fines tranches de pomme. Chauffer au four quelques minutes. Finir avec un filet de sirop Doré.',
      epicerie: ['Baguette', 'Brie', 'Pommes'],
    },
    {
      title: 'Tofu laqué au sirop Foncé',
      grade: 'Foncé',
      ingredients: ['1 bloc de tofu ferme', 'Sauce soja', 'Graines de sésame', '¼ tasse de sirop Foncé'],
      instructions: 'Couper le tofu en tranches. Poêler jusqu\'à croustillant. Laquer avec le mélange soja et sirop Foncé. Garnir de sésame grillé.',
      epicerie: ['Tofu ferme', 'Sauce soja', 'Graines de sésame'],
    },
  ],
  'souper': [
    {
      title: 'Saumon laqué érable et gingembre',
      grade: 'Foncé',
      ingredients: ['4 pavés de saumon', '¼ tasse de sirop Foncé', 'Gingembre frais râpé', 'Sauce soja'],
      instructions: 'Mélanger le sirop, le gingembre et la sauce soja pour créer la marinade. Mariner le saumon 30 minutes. Cuire au four à 400 °F pendant 15 minutes.',
      epicerie: ['Saumon', 'Gingembre frais'],
    },
    {
      title: 'Filet de porc au sirop Très Foncé',
      grade: 'Très Foncé',
      ingredients: ['2 filets de porc', 'Bleuets frais', 'Vinaigre balsamique', '⅓ tasse de sirop Très Foncé'],
      instructions: 'Saisir les filets de porc au poêlon. Terminer la cuisson au four. Préparer la sauce en réduisant le sirop Très Foncé avec les bleuets et le balsamique.',
      epicerie: ['Filets de porc', 'Bleuets', 'Vinaigre balsamique'],
    },
    {
      title: 'Cuisses de poulet BBQ Érable',
      grade: 'Très Foncé',
      ingredients: ['8 hauts de cuisses', 'Sauce tomate', '¼ tasse de sirop Très Foncé', 'Épices BBQ'],
      instructions: 'Mélanger la sauce tomate, le sirop et les épices. Badigeonner les cuisses généreusement. Griller au BBQ ou cuire au four à 375 °F pendant 40 minutes.',
      epicerie: ['Hauts de cuisses de poulet', 'Sauce tomate'],
    },
  ],
  'desserts': [
    {
      title: 'Tarte au sirop d\'érable',
      grade: 'Foncé',
      ingredients: ['1 fond de tarte', '1 tasse de sirop Foncé', '1 tasse de crème 35 %', '2 œufs'],
      instructions: 'Bouillir le sirop et la crème ensemble. Tempérer les œufs et incorporer. Verser dans le fond de tarte et cuire à 350 °F jusqu\'à ce que la garniture soit figée.',
      epicerie: ['Croûte à tarte', 'Crème 35 %'],
    },
    {
      title: 'Pouding chômeur au sirop Ambré',
      grade: 'Ambré',
      ingredients: ['Pâte à gâteau simple', '1½ tasse de sirop Ambré', '1 tasse d\'eau bouillante'],
      instructions: 'Préparer la pâte et l\'étendre dans un moule beurré. Mélanger le sirop Ambré et l\'eau bouillante, verser délicatement sur la pâte. Cuire 35 minutes à 350 °F.',
      epicerie: ['Farine', 'Sucre', 'Lait'],
    },
    {
      title: 'Mousse à l\'érable légère',
      grade: 'Doré',
      ingredients: ['½ tasse de sirop Doré', '3 blancs d\'œufs', '1 tasse de crème fouettée'],
      instructions: 'Réduire le sirop Doré au tiers. Monter les blancs en neige ferme. Verser le sirop chaud en filet sur les blancs en fouettant. Plier délicatement la crème fouettée.',
      epicerie: ['Œufs', 'Crème 35 %'],
    },
  ],
  'boissons-alcool': [
    {
      title: 'Old Fashioned à l\'érable',
      grade: 'Foncé',
      ingredients: ['2 oz de bourbon', '1 c. à soupe de sirop Foncé', '2 traits de bitters Angostura', 'Zeste d\'orange'],
      instructions: 'Verser le sirop et les bitters dans un verre. Ajouter le bourbon et de gros glaçons. Remuer doucement. Garnir d\'un zeste d\'orange.',
      epicerie: ['Bourbon', 'Orange', 'Bitters Angostura'],
    },
    {
      title: 'Whisky Sour à l\'érable',
      grade: 'Ambré',
      ingredients: ['2 oz de whisky', '1 oz de jus de citron', '¾ oz de sirop Ambré', '1 blanc d\'œuf'],
      instructions: 'Secouer tous les ingrédients vigoureusement avec de la glace. Filtrer dans un verre. Garnir d\'une cerise et d\'un zeste de citron.',
      epicerie: ['Whisky', 'Citrons', 'Cerises'],
    },
    {
      title: 'Gin Tonic Érable et Romarin',
      grade: 'Doré',
      ingredients: ['2 oz de gin', '½ oz de sirop Doré', 'Eau tonique', 'Branche de romarin'],
      instructions: 'Verser le gin et le sirop Doré sur glace. Compléter avec l\'eau tonique. Garnir d\'une branche de romarin légèrement brûlée.',
      epicerie: ['Gin', 'Eau tonique', 'Romarin frais'],
    },
  ],
  'boissons-sans-alcool': [
    {
      title: 'Limonade Érable et Menthe',
      grade: 'Doré',
      ingredients: ['4 citrons pressés', 'Feuilles de menthe fraîche', '¼ tasse de sirop Doré', '4 tasses d\'eau froide'],
      instructions: 'Mélanger le jus de citron, l\'eau et le sirop Doré. Ajouter les feuilles de menthe froissées. Servir bien frais avec des glaçons.',
      epicerie: ['Citrons', 'Menthe fraîche'],
    },
    {
      title: 'Café à la mousse d\'érable',
      grade: 'Ambré',
      ingredients: ['Café froid infusé', 'Lait entier', '2 c. à soupe de sirop Ambré'],
      instructions: 'Mousser le lait avec le sirop Ambré jusqu\'à obtenir une belle mousse. Verser sur le café froid. Saupoudrer de cannelle.',
      epicerie: ['Café moulu', 'Lait'],
    },
    {
      title: 'Chocolat chaud à l\'érable',
      grade: 'Foncé',
      ingredients: ['2 tasses de lait', '3 c. à soupe de cacao', '3 c. à soupe de sirop Foncé', 'Crème fouettée'],
      instructions: 'Chauffer le lait avec le cacao et le sirop Foncé en fouettant. Servir dans de grandes tasses, couronner de crème fouettée et d\'un filet de sirop.',
      epicerie: ['Cacao en poudre', 'Lait', 'Crème fouettée'],
    },
  ],
}

function App() {
  const [formData, setFormData] = useState({
    nom: '',
    courriel: '',
    telephone: '',
    produit: '',
    quantite: 1,
    instructions: ''
  })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [expandedCards, setExpandedCards] = useState([])

  // Cart state
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [cartError, setCartError] = useState('')
  const [addedFeedback, setAddedFeedback] = useState(null)

  // Recipe section state
  const [activeRecipeCategory, setActiveRecipeCategory] = useState(null)

  // Admin state
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminAuth, setAdminAuth] = useState(false)
  const [adminToken, setAdminToken] = useState(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [reservations, setReservations] = useState(loadReservations)

  // Export filter state
  const [exportDateFrom, setExportDateFrom] = useState('')
  const [exportDateTo, setExportDateTo] = useState('')
  const [exportStatut, setExportStatut] = useState('Tous')
  const [showExportFilters, setShowExportFilters] = useState(false)

  // Admin selection state for bulk delete
  const [selectedReservations, setSelectedReservations] = useState(new Set())

  // Notification state
  const [notifEnabled, setNotifEnabled] = useState(true)
  const [lastChecked, setLastChecked] = useState(null)
  const [newReservationCount, setNewReservationCount] = useState(0)
  const notifLastCountRef = useRef(loadNotifLastCount())

  // Out of stock mode (loaded from server)
  const [outOfStock, setOutOfStock] = useState(false)

  const toggleOutOfStock = useCallback(async () => {
    const next = !outOfStock
    setOutOfStock(next)
    localStorage.setItem('cabane_oos_public', next ? 'true' : 'false')
    if (adminToken) {
      await apiSaveSettings(adminToken, { outOfStock: next })
    }
  }, [outOfStock, adminToken])

  // Login form state
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [loginPassword, setLoginPassword] = useState('')

  // Password reset / security question state
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetQuestion, setResetQuestion] = useState('')
  const [resetAnswer, setResetAnswer] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [resetNewPwError, setResetNewPwError] = useState('')
  const [resetNewPwLoading, setResetNewPwLoading] = useState(false)

  // Security question setup (inside admin panel)
  const [showSecuritySetup, setShowSecuritySetup] = useState(false)
  const [securityQuestion, setSecurityQuestion] = useState('')
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [securitySetupMsg, setSecuritySetupMsg] = useState('')
  const [securityConfigured, setSecurityConfigured] = useState(false)

  // Change password (inside admin panel)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [cpCurrentPassword, setCpCurrentPassword] = useState('')
  const [cpNewPassword, setCpNewPassword] = useState('')
  const [cpConfirmPassword, setCpConfirmPassword] = useState('')
  const [cpMsg, setCpMsg] = useState('')
  const [cpLoading, setCpLoading] = useState(false)

  const reservationRef = useRef(null)

  // Update reservation status
  const updateReservationStatut = useCallback((numero, newStatut) => {
    setReservations(prev => {
      const updated = prev.map(r =>
        r.numero === numero ? { ...r, statut: newStatut } : r
      )
      saveReservations(updated)
      return updated
    })
    if (adminToken) apiUpdateStatus(adminToken, numero, newStatut)
  }, [adminToken])

  // Toggle single reservation checkbox
  const toggleReservationSelect = useCallback((numero) => {
    setSelectedReservations(prev => {
      const next = new Set(prev)
      if (next.has(numero)) {
        next.delete(numero)
      } else {
        next.add(numero)
      }
      return next
    })
  }, [])

  // Toggle select-all checkbox
  const toggleSelectAll = useCallback(() => {
    setSelectedReservations(prev => {
      if (prev.size === reservations.length && reservations.length > 0) {
        return new Set()
      }
      return new Set(reservations.map(r => r.numero))
    })
  }, [reservations])

  // Delete selected reservations
  const deleteSelectedReservations = useCallback(() => {
    if (selectedReservations.size === 0) return
    const count = selectedReservations.size
    if (!confirm(`Supprimer ${count} réservation(s) sélectionnée(s)?`)) return
    const numeros = [...selectedReservations]
    setReservations(prev => {
      const updated = prev.filter(r => !selectedReservations.has(r.numero))
      saveReservations(updated)
      return updated
    })
    if (adminToken) apiDeleteReservations(adminToken, numeros)
    setSelectedReservations(new Set())
  }, [selectedReservations, adminToken])

  // Restore session from stored token on mount
  useEffect(() => {
    const stored = loadToken()
    if (!stored) return
    ;(async () => {
      const valid = await apiVerifyToken(stored)
      if (valid) {
        setAdminToken(stored)
        setAdminAuth(true)
        // Load shared settings from server
        const settings = await apiGetSettings(stored)
        if (settings) {
          setOutOfStock(settings.outOfStock ?? false)
          setNotifEnabled(settings.notifEnabled ?? false)
        }
        // Load reservations from server
        const serverData = await apiGetReservations(stored)
        if (serverData && serverData !== 'UNAUTHORIZED') {
          saveReservations(serverData)
          setReservations(serverData)
          notifLastCountRef.current = serverData.length
          saveNotifLastCount(serverData.length)
        }
        // Load security question status
        const sqData = await apiGetSecurityQuestion()
        if (sqData) {
          setSecurityConfigured(sqData.configured)
          if (sqData.configured && sqData.question) setSecurityQuestion(sqData.question)
        }
      } else {
        clearToken()
      }
    })()
  }, [])

  // Load out-of-stock state on mount for ALL visitors (public endpoint, no auth)
  useEffect(() => {
    // Show cached value immediately to avoid flash
    const cachedOOS = localStorage.getItem('cabane_oos_public')
    if (cachedOOS === 'true') setOutOfStock(true)
    // Then fetch fresh value from server
    ;(async () => {
      try {
        const res = await fetch('/.netlify/functions/public-settings')
        if (res.ok) {
          const data = await res.json()
          setOutOfStock(data.outOfStock ?? false)
          localStorage.setItem('cabane_oos_public', data.outOfStock ? 'true' : 'false')
        }
      } catch { /* use cached value */ }
    })()
  }, [])

  // Handle admin login via server
  const handleAdminLogin = async (e) => {
    if (e) e.preventDefault()
    setLoginError('')
    setAdminLoading(true)

    const token = await apiLogin(loginPassword)
    setAdminLoading(false)

    if (token) {
      saveToken(token)
      setAdminToken(token)
      setAdminAuth(true)
      setShowLoginModal(false)
      setLoginPassword('')
      setAdminOpen(true)

      // Load shared settings
      const settings = await apiGetSettings(token)
      if (settings) {
        setOutOfStock(settings.outOfStock ?? false)
        setNotifEnabled(settings.notifEnabled ?? false)
        // Cache out-of-stock for public visitors
        localStorage.setItem('cabane_oos_public', settings.outOfStock ? 'true' : 'false')
      }

      // Load reservations
      const serverData = await apiGetReservations(token)
      const current = (serverData && serverData !== 'UNAUTHORIZED') ? serverData : loadReservations()
      if (serverData && serverData !== 'UNAUTHORIZED') saveReservations(serverData)
      setReservations(current)
      notifLastCountRef.current = current.length
      saveNotifLastCount(current.length)
      setNewReservationCount(0)

      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }

      // Load security question status
      loadSecurityStatus()
    } else {
      setLoginError('Mot de passe incorrect.')
    }
  }

  // Admin logout
  const handleAdminLogout = useCallback(() => {
    clearToken()
    setAdminToken(null)
    setAdminAuth(false)
    setAdminOpen(false)
  }, [])

  // Open password reset flow — fetch the security question first
  const openResetModal = async () => {
    setShowLoginModal(false)
    setResetError('')
    setResetAnswer('')
    setResetSuccess(false)
    setResetNewPassword('')
    setResetConfirmPassword('')
    setResetNewPwError('')
    setResetLoading(true)
    setShowResetModal(true)
    const data = await apiGetSecurityQuestion()
    setResetLoading(false)
    if (data && data.configured) {
      setResetQuestion(data.question)
    } else {
      setResetQuestion('')
      setResetError("Aucune question de sécurité n'a été configurée. Contactez un autre administrateur.")
    }
  }

  // Submit reset answer — on success, show "set new password" step
  const handleResetSubmit = async (e) => {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    const result = await apiResetPassword(resetAnswer)
    setResetLoading(false)
    if (result.token) {
      // Store the token but stay in the modal for the new password step
      saveToken(result.token)
      setAdminToken(result.token)
      setAdminAuth(true)
      setResetAnswer('')
      setResetSuccess(true)
    } else {
      setResetError(result.error || 'Réponse incorrecte.')
    }
  }

  // Set new password after security question reset
  const handleResetNewPassword = async (e) => {
    e.preventDefault()
    setResetNewPwError('')
    if (resetNewPassword.length < 8) {
      setResetNewPwError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetNewPwError('Les mots de passe ne correspondent pas.')
      return
    }
    setResetNewPwLoading(true)
    const result = await apiChangePassword(adminToken, '', resetNewPassword)
    setResetNewPwLoading(false)
    if (result.success) {
      // Close modal and open admin panel
      setShowResetModal(false)
      setResetSuccess(false)
      setResetNewPassword('')
      setResetConfirmPassword('')
      setAdminOpen(true)
      // Load data
      const settings = await apiGetSettings(adminToken)
      if (settings) {
        setOutOfStock(settings.outOfStock ?? false)
        setNotifEnabled(settings.notifEnabled ?? false)
      }
      const serverData = await apiGetReservations(adminToken)
      const current = (serverData && serverData !== 'UNAUTHORIZED') ? serverData : loadReservations()
      if (serverData && serverData !== 'UNAUTHORIZED') saveReservations(serverData)
      setReservations(current)
      notifLastCountRef.current = current.length
      saveNotifLastCount(current.length)
      setNewReservationCount(0)
      loadSecurityStatus()
    } else {
      setResetNewPwError(result.error || 'Erreur lors du changement de mot de passe.')
    }
  }

  // Save security question from admin panel
  const handleSecuritySetup = async (e) => {
    e.preventDefault()
    setSecuritySetupMsg('')
    if (!securityQuestion.trim() || !securityAnswer.trim()) {
      setSecuritySetupMsg('Question et réponse requises.')
      return
    }
    const result = await apiSetSecurityQuestion(adminToken, securityQuestion.trim(), securityAnswer.trim())
    if (result && result.success) {
      setSecuritySetupMsg('✓ Question de sécurité enregistrée!')
      setSecurityConfigured(true)
      setSecurityAnswer('')
      setTimeout(() => setSecuritySetupMsg(''), 3000)
    } else {
      setSecuritySetupMsg('Erreur lors de la sauvegarde.')
    }
  }

  // Change admin password from admin panel
  const handleChangePassword = async (e) => {
    e.preventDefault()
    setCpMsg('')
    if (!cpCurrentPassword || !cpNewPassword || !cpConfirmPassword) {
      setCpMsg('Tous les champs sont requis.')
      return
    }
    if (cpNewPassword.length < 8) {
      setCpMsg('Le nouveau mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (cpNewPassword !== cpConfirmPassword) {
      setCpMsg('Les mots de passe ne correspondent pas.')
      return
    }
    setCpLoading(true)
    const result = await apiChangePassword(adminToken, cpCurrentPassword, cpNewPassword)
    setCpLoading(false)
    if (result.success) {
      setCpMsg('✓ Mot de passe modifié avec succès!')
      setCpCurrentPassword('')
      setCpNewPassword('')
      setCpConfirmPassword('')
      setTimeout(() => setCpMsg(''), 3000)
    } else {
      setCpMsg(result.error || 'Erreur lors du changement de mot de passe.')
    }
  }

  // Load security question status when admin logs in
  const loadSecurityStatus = async () => {
    const data = await apiGetSecurityQuestion()
    if (data) {
      setSecurityConfigured(data.configured)
      if (data.configured && data.question) setSecurityQuestion(data.question)
    }
  }

  // Toggle browser notifications (saves to server so all admins share state)
  const toggleNotifications = useCallback(async () => {
    if (!notifEnabled) {
      // Turning on — request permission if needed
      if ('Notification' in window) {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          alert('Les notifications ont été bloquées par le navigateur. Vérifiez les paramètres de votre navigateur.')
          return
        }
      }
      setNotifEnabled(true)
      if (adminToken) apiSaveSettings(adminToken, { notifEnabled: true })
    } else {
      setNotifEnabled(false)
      if (adminToken) apiSaveSettings(adminToken, { notifEnabled: false })
    }
  }, [notifEnabled, adminToken])

  // Poll for new reservations while admin is authenticated
  useEffect(() => {
    if (!adminAuth || !notifEnabled || !adminToken) return

    const checkForNew = async () => {
      const serverData = await apiGetReservations(adminToken)
      if (serverData === 'UNAUTHORIZED') {
        // Token expired — force logout
        handleAdminLogout()
        return
      }
      const current = serverData || loadReservations()
      if (serverData) saveReservations(serverData) // sync localStorage with server
      const currentCount = current.length
      const lastCount = notifLastCountRef.current
      setLastChecked(new Date())

      if (currentCount > lastCount) {
        const newOnes = current.slice(lastCount)
        setNewReservationCount(currentCount - lastCount)
        setReservations(current)

        // Send browser notification for each new reservation
        if ('Notification' in window && Notification.permission === 'granted') {
          newOnes.forEach(r => {
            new Notification('Nouvelle Réservation!', {
              body: `${r.nom} — ${formatProduits(r) || 'Panier'}`,
              icon: '/images/logo.png',
              tag: `reservation-${r.numero}`,
            })
          })
        }
      }

      // Also refresh shared settings (out-of-stock could have changed on another device)
      const settings = await apiGetSettings(adminToken)
      if (settings) {
        setOutOfStock(settings.outOfStock ?? false)
        localStorage.setItem('cabane_oos_public', settings.outOfStock ? 'true' : 'false')
      }
    }

    // Check immediately, then every 30 seconds
    checkForNew()
    const interval = setInterval(checkForNew, 30000)
    return () => clearInterval(interval)
  }, [adminAuth, notifEnabled, adminToken, handleAdminLogout])

  // When admin opens panel, sync the count so badge clears
  const handleAdminPanelOpen = useCallback(async () => {
    if (!adminToken) return
    const serverData = await apiGetReservations(adminToken)
    if (serverData === 'UNAUTHORIZED') {
      handleAdminLogout()
      return
    }
    const current = serverData || loadReservations()
    if (serverData) saveReservations(serverData)
    setReservations(current)
    notifLastCountRef.current = current.length
    saveNotifLastCount(current.length)
    setNewReservationCount(0)
    setAdminOpen(true)
  }, [adminToken, handleAdminLogout])

  // Open login modal
  const openLoginModal = () => {
    setShowLoginModal(true)
    setLoginPassword('')
    setLoginError('')
  }



  const toggleCard = (cardId) => {
    setExpandedCards(prev =>
      prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]
    )
  }

  // Close expanded cards when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (expandedCards.length > 0 && !e.target.closest('.product-card')) {
        setExpandedCards([])
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [expandedCards])

  // Cart functions
  const addToCart = (productId, e) => {
    e.stopPropagation() // Prevent card expansion

    const product = PRODUCTS[productId]
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === productId)
      if (existingItem) {
        return prevCart.map(item =>
          item.id === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prevCart, { ...product, quantity: 1 }]
    })

    // Show feedback
    setAddedFeedback(productId)
    setTimeout(() => setAddedFeedback(null), 1500)
  }

  const removeFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== productId))
  }

  const updateCartQuantity = (productId, newQuantity) => {
    if (newQuantity < 1) {
      removeFromCart(productId)
      return
    }
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    )
  }

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0)
  }

  const getCartSummary = () => {
    return cart.map(item => `${item.name} x${item.quantity}`).join(', ')
  }

  // Check if cans can be converted to cases (multiples of 8)
  const getCanToCaseSuggestion = () => {
    const canItem = cart.find(item => item.id === 'can')
    if (!canItem || canItem.quantity < 8) return null
    const cases = Math.floor(canItem.quantity / 8)
    const remaining = canItem.quantity % 8
    return { cases, remaining, totalCans: canItem.quantity }
  }

  // Convert cans to cases
  const convertCansToCases = () => {
    const suggestion = getCanToCaseSuggestion()
    if (!suggestion) return
    const { cases, remaining } = suggestion

    setCart(prevCart => {
      let updated = prevCart

      // Update or remove the can entry
      if (remaining > 0) {
        updated = updated.map(item =>
          item.id === 'can' ? { ...item, quantity: remaining } : item
        )
      } else {
        updated = updated.filter(item => item.id !== 'can')
      }

      // Add to existing case entry or create new one
      const existingCase = updated.find(item => item.id === 'case')
      if (existingCase) {
        updated = updated.map(item =>
          item.id === 'case' ? { ...item, quantity: item.quantity + cases } : item
        )
      } else {
        updated = [...updated, { ...PRODUCTS.case, quantity: cases }]
      }

      return updated
    })
  }

  const handleCheckout = async () => {
    setCartError('')

    if (cart.length === 0) {
      setCartError('Votre panier est vide.')
      return
    }

    // Close cart and scroll to reservation form, then submit
    // submitOrder() handles all validation (nom, telephone) and shows errors on the main form
    setCartOpen(false)
    reservationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    await submitOrder()
  }

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    if (digits.length === 0) return ''
    if (digits.length <= 3) return `(${digits}`
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} - ${digits.slice(6)}`
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'telephone') {
      setFormData(prev => ({
        ...prev,
        telephone: formatPhone(value)
      }))
      return
    }
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  // Core submission logic — used by both the form submit and the cart checkout button
  const submitOrder = async () => {
    setError('')

    // Validate that at least one product is in the cart
    if (cart.length === 0) {
      setError('Veuillez ajouter au moins un produit à votre panier avant de réserver.')
      reservationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    // Validate required contact fields
    if (!formData.nom.trim() || !formData.telephone.trim()) {
      setError('Veuillez remplir votre nom et numéro de téléphone.')
      reservationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    // Build structured product list (one entry per cart item)
    const produits = cart.map(item => ({
      nom: item.name,
      quantite: item.quantity,
    }))

    // Instructions = only what the user actually typed
    const userInstructions = formData.instructions.trim()

    // Build Netlify Forms submission (flat fields for email notification)
    const formBody = new URLSearchParams()
    formBody.append('form-name', 'reservation')
    formBody.append('nom', formData.nom)
    formBody.append('telephone', formData.telephone)
    formBody.append('courriel', formData.courriel)
    formBody.append('produit', produits.map(p => `${p.nom} x${p.quantite}`).join(', '))
    formBody.append('quantite', cart.reduce((t, i) => t + i.quantity, 0))
    if (userInstructions) formBody.append('instructions', userInstructions)

    // Build reservation data with structured fields
    const resData = {
      nom: formData.nom,
      telephone: formData.telephone,
      courriel: formData.courriel || '',
      produits,
      instructions: userInstructions,
    }
    setReservations(prev => {
      const newRes = {
        numero: getNextNumber(prev),
        date: new Date().toISOString(),
        ...resData,
        statut: 'Réservé',
      }
      const updated = [...prev, newRes]
      saveReservations(updated)
      return updated
    })

    // Save to server (Netlify Blobs) for cross-device admin access
    apiSaveReservation(resData)

    // Attempt Netlify form submission (best-effort)
    try {
      await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString()
      })
    } catch {
      // Netlify submission failed (e.g. local dev) — reservation is already saved locally
    }

    setSubmitted(true)
    if (!outOfStock) launchMapleConfetti()
    setCart([]) // Clear cart on success
    setFormData({
      nom: '',
      courriel: '',
      telephone: '',
      produit: '',
      quantite: 1,
      instructions: ''
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    await submitOrder()
  }

  return (
    <div className="app">

      {/* Cart Overlay */}
      {cartOpen && <div className="cart-overlay" onClick={() => setCartOpen(false)} />}

      <header className="header">
        <img src="/images/logo.png" alt="Cabane Crête au Sirop" className="logo" />

        <div className="header-text">
          <h1 className="title">Cabane Crête au Sirop</h1>
          <p className="slogan">100% Érable. 0% fla-fla</p>
        </div>

        <div className="header-right">
          <button
            className={`header-cart-btn ${cart.length > 0 ? 'has-items' : ''}`}
            onClick={() => { setCartOpen(!cartOpen); setCartError(''); }}
            aria-label="Ouvrir le panier"
          >
            <span className="cart-icon">🛒</span>
            <span className="cart-label">PANIER</span>
            {cart.length > 0 && (
              <span className="cart-badge">{getTotalItems()}</span>
            )}
          </button>

          {/* Cart Dropdown */}
          <div className={`cart-dropdown ${cartOpen ? 'open' : ''}`}>
            <div className="cart-dropdown-header">
              <h3>🛒 Votre Panier</h3>
              <button className="cart-close-btn" onClick={() => setCartOpen(false)}>✕</button>
            </div>
            {cart.length === 0 ? (
              <p className="cart-empty">Votre panier est vide.</p>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map(item => (
                    <div key={item.id} className="cart-item">
                      <div className="cart-item-info">
                        <span className="cart-item-name">{item.name}</span>
                        <div className="cart-item-controls">
                          <button
                            className="cart-qty-btn"
                            onClick={() => setCart(prev => prev.map(c => c.id === item.id ? { ...c, quantity: Math.max(1, c.quantity - 1) } : c))}
                          >−</button>
                          <span className="cart-item-qty">{item.quantity}</span>
                          <button
                            className="cart-qty-btn"
                            onClick={() => setCart(prev => prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))}
                          >+</button>
                        </div>
                      </div>
                      <button
                        className="cart-remove-btn"
                        onClick={() => setCart(prev => prev.filter(c => c.id !== item.id))}
                      >🗑</button>
                    </div>
                  ))}
                </div>
                {cartError && <div className="cart-error-message">{cartError}</div>}
                <button className="cart-checkout-btn" onClick={handleCheckout}>
                  Envoyer
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="intro-section">
          <h2>Bienvenue dans notre cabane!</h2>
          <p className="intro-tagline">De la forêt à votre table, tout simplement.</p>
          <p className="intro-text">
            La tradition de l'érable est avant tout une histoire de passion et de patience. Chaque printemps, au cœur de l'érablière, nous récoltons la sève avec le plus grand soin pour en extraire le meilleur du terroir. Transformé selon les règles de l'art, notre sirop offre une qualité exceptionnelle et le goût authentique du printemps québécois.
          </p>
        </section>

        <section className={`products-section${outOfStock ? ' products-out-of-stock' : ''}`} id="produits">
          {outOfStock && (
            <div className="oos-hero">
              <h2 className="oos-headline">On a tout vidé ! 🥞</h2>
              <p className="oos-subheadline">
                Vous avez été si gourmands que nos réserves ont fondu comme du beurre sur une pile de crêpes.
                On se revoit l'an prochain pour la coulée 2027. D'ici là, savourez chaque goutte qu'il vous reste !
              </p>
            </div>
          )}
          <h2 className="products-title">
            <img src="/images/Maple_Leaf.png" alt="" className="title-leaf title-leaf-left" />
            Nos Produits
            <img src="/images/Maple_Leaf.png" alt="" className="title-leaf title-leaf-right" />
          </h2>
          <div className="products-grid">
            {/* Product Card 1 - L'Authentique */}
            <div
              className={`product-card ${expandedCards.includes('can') ? 'expanded' : ''}`}
              onClick={() => toggleCard('can')}
            >
              <div className="product-card-front">
                <span className="product-title">« L'Authentique »</span>
                <div className="product-image-container">
                  <img src="/images/product-can.png" alt="Canne de sirop d'érable 540ml" className="product-image" />
                </div>
                <h3>L'Or de la Forêt : Sirop d'érable pur de tradition ancestrale</h3>
                <p className="product-tagline">Plus qu'un simple sucre naturel, c'est un siècle de tradition dans une seule canne.</p>
                <div className="expand-indicator">
                  <span className="expand-icon">{expandedCards.includes('can') ? '−' : '+'}</span>
                  <span className="expand-text">{expandedCards.includes('can') ? 'Moins de détails' : 'Plus de détails'}</span>
                </div>
              </div>
              <div className="product-card-details">
                <div className="product-format">
                  <strong>Format :</strong> Canne classique de 540 ml
                </div>
                <p className="product-description">
                  Récolté au cœur des érablières enneigées du Québec, ce sirop est le goût véritable du printemps.
                  Bouilli à l'ancienne sur un feu de bois ardent dans notre cabane à sucre familiale,
                  notre sirop au goût unique et riche capture l'essence même du dégel.
                  Il offre un bouquet de saveurs complexe : des notes de caramel chaud, de vanille
                  et une subtile touche fumée qui ne peut provenir que d'un savoir-faire artisanal.
                </p>
                <div className="product-uses">
                  <strong>Idéal pour :</strong>
                  <ul>
                    <li>Napper vos crêpes croustillantes ou un pain doré épais.</li>
                    <li>Laquer un saumon ou des légumes racines rôtis.</li>
                    <li>Sucrer naturellement votre café ou votre thé du matin.</li>
                  </ul>
                </div>
              </div>
              {outOfStock ? (
                <button className="add-to-cart-btn oos-disabled-btn" disabled>
                  On se voit en 2027
                </button>
              ) : (
                <button
                  className={`add-to-cart-btn ${addedFeedback === 'can' ? 'added' : ''}`}
                  onClick={(e) => addToCart('can', e)}
                >
                  {addedFeedback === 'can' ? '✓ Ajouté!' : '🛒 Ajouter au Panier'}
                </button>
              )}
            </div>

            {/* Product Card 2 - La Réserve */}
            <div
              className={`product-card ${expandedCards.includes('case') ? 'expanded' : ''}`}
              onClick={() => toggleCard('case')}
            >
              <div className="product-card-front">
                <span className="product-title">« La Réserve du Maître Sucrier »</span>
                <div className="product-image-container">
                  <img src="/images/product-case.png" alt="Caisse de 8 cannes de sirop d'érable" className="product-image" />
                </div>
                <h3>La Réserve d'Hiver : Caisse de 8 cannes</h3>
                <p className="product-tagline">Faites vos provisions d'or liquide pour l'année. Le goût authentique du Québec, stocké pour les vrais connaisseurs.</p>
                <div className="expand-indicator">
                  <span className="expand-icon">{expandedCards.includes('case') ? '−' : '+'}</span>
                  <span className="expand-text">{expandedCards.includes('case') ? 'Moins de détails' : 'Plus de détails'}</span>
                </div>
              </div>
              <div className="product-card-details">
                <div className="product-format">
                  <strong>Format :</strong> 8 cannes de 540 ml (4,32 L au total)
                </div>
                <p className="product-description">
                  Il y a un grand réconfort à savoir que son garde-manger est rempli du meilleur produit de notre terroir.
                  Notre caisse « Réserve du Maître Sucrier » vous apporte la récolte directement de notre forêt à votre maison.
                  Que vous soyez un pâtissier passionné, le roi ou la reine des brunchs du dimanche, ou simplement quelqu'un qui sait
                  que la vraie qualité ne se précipite pas, cette caisse vous assure de ne jamais manquer de l'essentiel.
                </p>
                <div className="product-uses">
                  <strong>Pourquoi acheter la caisse?</strong>
                  <ul>
                    <li><strong>Le Cadeau du Partage :</strong> Avec 8 magnifiques cannes au style vintage, vous avez toujours sous la main le cadeau d'hôte parfait, une surprise pour les fêtes ou un merci chaleureux pour un voisin.</li>
                    <li><strong>Qualité Constante :</strong> Provenant d'une seule et même coulée saisonnière pour assurer que chaque canne offre le même profil de saveur exceptionnel.</li>
                    <li><strong>Conservation Longue Durée :</strong> Non ouvert, notre sirop en conserve préserve son profil de saveur optimal pendant des années. Gardez-les au frais et à l'ombre pour retrouver le goût du printemps même au cœur de l'hiver.</li>
                  </ul>
                </div>
              </div>
              {outOfStock ? (
                <button className="add-to-cart-btn oos-disabled-btn" disabled>
                  On se voit en 2027
                </button>
              ) : (
                <button
                  className={`add-to-cart-btn ${addedFeedback === 'case' ? 'added' : ''}`}
                  onClick={(e) => addToCart('case', e)}
                >
                  {addedFeedback === 'case' ? '✓ Ajouté!' : '🛒 Ajouter au Panier'}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="reservation-section" id="reservation" ref={reservationRef}>
          {outOfStock ? (
            <>
              <h2>🍁 La saison est terminée ! 🍁</h2>
              <div className="oos-reservation-notice">
                <p>Les réservations sont fermées pour cette saison. On se retrouve au printemps prochain !</p>
              </div>
            </>
          ) : (
            <>
              <h2>🍁 Gâtez-vous, c'est le temps des sucres ! 🍁</h2>
              <p className="reservation-intro">
                Pas besoin de courir les bois : commandez votre or liquide ici !<br />
                Un petit clic sur le formulaire, et on s'occupe de vous contacter pour que votre sirop passe de nos érables à votre table.
              </p>
            </>
          )}

          {/* Cart Summary in Form */}
          {!outOfStock && cart.length > 0 && !submitted && (
            <div className="form-cart-summary">
              <h4>📦 Articles dans votre panier :</h4>
              <div className="form-cart-items">
                {cart.map(item => (
                  <div key={item.id} className="form-cart-item">
                    <span className="form-cart-item-name">{item.name}</span>
                    <div className="form-cart-item-controls">
                      <button
                        type="button"
                        className="form-cart-qty-btn"
                        onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                        aria-label="Diminuer la quantité"
                      >−</button>
                      <span className="form-cart-item-qty">{item.quantity}</span>
                      <button
                        type="button"
                        className="form-cart-qty-btn"
                        onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                        aria-label="Augmenter la quantité"
                      >+</button>
                      <button
                        type="button"
                        className="form-cart-delete-btn"
                        onClick={() => removeFromCart(item.id)}
                        aria-label="Supprimer l'article"
                      >🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
              {getCanToCaseSuggestion() && (() => {
                const { cases, remaining, totalCans } = getCanToCaseSuggestion()
                return (
                  <div className="form-cart-suggestion">
                    <span className="form-cart-suggestion-icon">💡</span>
                    <div className="form-cart-suggestion-text">
                      <p>
                        Vos <strong>{totalCans} cannes</strong> peuvent devenir{' '}
                        <strong>{cases} caisse{cases > 1 ? 's' : ''}</strong>
                        {remaining > 0 && <> + <strong>{remaining} canne{remaining > 1 ? 's' : ''}</strong></>} !
                      </p>
                      <button
                        type="button"
                        className="form-cart-suggestion-btn"
                        onClick={convertCansToCases}
                      >
                        Convertir en caisse{cases > 1 ? 's' : ''}
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {submitted && !outOfStock ? (
            <div className="success-message">
              <span className="success-icon">✓</span>
              <h3>C'est reçu ! On prépare votre lot d'or liquide. 🍁</h3>
              <p>On va faire un tour à la cabane pour checker les stocks, pis on vous revient au plus sacrant pour finaliser le tout. Merci ben gros!</p>
              <button
                className="new-reservation-btn"
                onClick={() => setSubmitted(false)}
              >
                Faire une nouvelle réservation
              </button>
            </div>
          ) : !outOfStock ? (
            <form
              name="reservation"
              method="POST"
              data-netlify="true"
              netlify-honeypot="bot-field"
              onSubmit={handleSubmit}
              className="reservation-form"
            >
              <input type="hidden" name="form-name" value="reservation" />
              <p className="hidden">
                <label>
                  Ne pas remplir si vous êtes humain: <input name="bot-field" />
                </label>
              </p>

              {error && <div className="error-message">{error}</div>}

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="nom">Nom *</label>
                  <input
                    type="text"
                    id="nom"
                    name="nom"
                    value={formData.nom}
                    onChange={handleChange}
                    required
                    placeholder="Votre nom complet"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="telephone">Téléphone *</label>
                  <input
                    type="tel"
                    id="telephone"
                    name="telephone"
                    value={formData.telephone}
                    onChange={handleChange}
                    required
                    placeholder="(514) 555-1234"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="courriel">Courriel</label>
                <input
                  type="email"
                  id="courriel"
                  name="courriel"
                  value={formData.courriel}
                  onChange={handleChange}
                  placeholder="votre@courriel.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="instructions">Instructions spéciales</label>
                <textarea
                  id="instructions"
                  name="instructions"
                  value={formData.instructions}
                  onChange={handleChange}
                  rows="1"
                  placeholder="Informations livraison, cueillette, etc."
                ></textarea>
              </div>

              <button type="submit" className="submit-btn">
                Envoyer la Réservation
              </button>
            </form>
          ) : null}
        </section>

        <section className="education-section">
          <h2>L'Art des Nuances : Comprendre les Variétés</h2>
          <p className="education-intro">
            Au Québec, le temps des sucres n'est pas uniforme; il évolue au rythme du printemps.
            La couleur et le goût du sirop d'érable sont le reflet direct du moment où la sève a été récoltée.
            En début de saison, lorsque l'air est vif et froid, le sirop est clair et délicat.
            À mesure que la forêt se réchauffe et que les bourgeons se préparent à éclore, le sirop gagne en caractère,
            devenant plus sombre et plus corsé. Il est important de noter qu'il n'y a pas de hiérarchie de qualité
            entre ces nuances : chaque catégorie est pure à 100 %, seule sa « personnalité » change pour s'adapter
            à vos goûts culinaires.
          </p>

          <div className="varieties-grid">
            <div className="variety-card">
              <span className="variety-badge badge-dore">🍯 Récolte Hâtive & Pureté</span>
              <div className="variety-number"><img src="/images/Dore.png" alt="Doré" className="variety-grade-img" /></div>
              <div className="variety-content">
                <h3>Doré, goût délicat</h3>
                <p className="variety-former">(Anciennement : Extra clair / Grade A Light)</p>
                <p className="variety-description">
                  Récolté au premier dégel, bouilli instantanément pour préserver sa clarté cristalline.
                </p>
                <div className="pairing-suggestion">
                  <p>🌸 Parfait pour les thés fins, le yogourt nature et les fruits frais.</p>
                </div>
              </div>
            </div>

            <div className="variety-card">
              <span className="variety-badge badge-ambre">🥞 L'Équilibre de Saison</span>
              <div className="variety-number"><img src="/images/Ambre.png" alt="Ambré" className="variety-grade-img" /></div>
              <div className="variety-content">
                <h3>Ambré, goût riche</h3>
                <p className="variety-former">(Anciennement : Clair ou Médium / Grade A Medium)</p>
                <p className="variety-description">
                  Le classique de mi-saison, maîtrisé pour obtenir cette couleur d'ambre parfaite et ce goût riche.
                </p>
                <div className="pairing-suggestion">
                  <p>🥞 Le roi des crêpes, des gaufres et du pain doré dominical.</p>
                </div>
              </div>
            </div>

            <div className="variety-card variety-card-fonce">
              <div className="fonce-ribbon">Coup de Cœur de la Cabane</div>
              <span className="variety-badge badge-fonce">🪵 Concentration & Caractère</span>
              <div className="variety-number"><img src="/images/Fonce.png" alt="Foncé" className="variety-grade-img" /></div>
              <div className="variety-content">
                <h3>Foncé, goût robuste</h3>
                <p className="variety-former">(Anciennement : L'Ambré ou Grade B)</p>
                <p className="variety-description">
                  Un bouillage prolongé qui laisse les sucres caraméliser, révélant des notes boisées profondes.
                </p>
                <div className="pairing-suggestion">
                  <p>🪵 Excellent pour les marinades de saumon, le porc et les tartes au sucre.</p>
                </div>
              </div>
            </div>

            <div className="variety-card">
              <span className="variety-badge badge-tres-fonce">🍳 Force de Fin de Saison</span>
              <div className="variety-number"><img src="/images/Tres Fonce.png" alt="Très Foncé" className="variety-grade-img" /></div>
              <div className="variety-content">
                <h3>Très foncé, goût prononcé</h3>
                <p className="variety-former">(Anciennement : Grade C)</p>
                <p className="variety-description">
                  Le résultat d'une sève mature et d'un savoir-faire intensif pour un goût corsé et puissant.
                </p>
                <div className="pairing-suggestion">
                  <p>👨‍🍳 L'allié des chefs pour les sauces BBQ, les fèves au lard et les gâteaux aux épices.</p>
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* Recipes Section */}
        <section className="recipes-section" id="recettes">
          <h2 className="recipes-title">
            <img src="/images/Maple_Leaf.png" alt="" className="title-leaf title-leaf-left" />
            Recettes de la Cabane
            <img src="/images/Maple_Leaf.png" alt="" className="title-leaf title-leaf-right" />
          </h2>
          <p className="recipes-intro">
            Découvrez nos recettes préférées pour savourer le sirop d'érable à chaque repas de la journée.
          </p>

          <div className="recipe-categories">
            <div className="recipe-categories-row">
              {RECIPE_CATEGORIES.slice(0, 3).map(cat => (
                <button
                  key={cat.id}
                  className={`recipe-category-btn${activeRecipeCategory === cat.id ? ' recipe-category-active' : ''}`}
                  onClick={() => setActiveRecipeCategory(prev => prev === cat.id ? null : cat.id)}
                >
                  <span className="recipe-category-emoji">{cat.emoji}</span>
                  <span className="recipe-category-label">{cat.label}</span>
                </button>
              ))}
            </div>
            <div className="recipe-categories-row">
              {RECIPE_CATEGORIES.slice(3).map(cat => (
                <button
                  key={cat.id}
                  className={`recipe-category-btn${activeRecipeCategory === cat.id ? ' recipe-category-active' : ''}`}
                  onClick={() => setActiveRecipeCategory(prev => prev === cat.id ? null : cat.id)}
                >
                  <span className="recipe-category-emoji">{cat.emoji}</span>
                  <span className="recipe-category-label">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {activeRecipeCategory && (
            <div className="recipe-cards-container">
              {RECIPES[activeRecipeCategory].map((recipe, idx) => (
                <div key={idx} className="recipe-card">
                  <div className="recipe-card-header">
                    <h3 className="recipe-card-title">{recipe.title}</h3>
                    <span className="recipe-grade-badge">Grade {recipe.grade}</span>
                  </div>

                  <div className="recipe-card-body">
                    <div className="recipe-ingredients">
                      <h4>🍁 Ingrédients <span className="recipe-portion">(4 personnes)</span></h4>
                      <ul>
                        {recipe.ingredients.map((ing, i) => (
                          <li key={i}>{ing}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="recipe-instructions">
                      <h4>📋 Préparation</h4>
                      <p>{recipe.instructions}</p>
                    </div>

                    <div className="recipe-grocery">
                      <h4>🛒 Liste d'épicerie</h4>
                      <div className="recipe-grocery-tags">
                        {recipe.epicerie.map((item, i) => (
                          <span key={i} className="recipe-grocery-tag">🍁 {item}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="disclaimer-section">
          <p>
            <strong>⚠️ Avertissement ⚠️</strong>
          </p>
          <p>
            La Cabane Crête au Sirop n'est pas responsable si vous finissez par mettre du sirop dans votre café, sur vos toasts, dans votre yogourt… pis ben, dans à peu près toute.
          </p>
          <p>
            La consommation de ce sirop peut entraîner une dépendance au bonheur sucré, des sourires incontrôlables, l'abandon officiel du régime, pis des taux de sucre qui montent en flèche.
          </p>
          <p>
            Notre sirop est franchement addictif. On vous aura avertis.
          </p>
          <p>
            Effets secondaires possibles : euphorie sucrée, pantalons un peu trop serrés, et débats passionnés sur la supériorité incontestable du sirop d'érable.
          </p>
          <p>
            Nous ne sommes responsables de rien.<br />
            Sauf du délice.
          </p>
          <p>
            <strong>⚜️ Savourez à vos risques… et surtout à vos plaisirs ! ⚜️</strong>
          </p>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-content">
          <p className="footer-name">Cabane Crête au Sirop</p>
          <p className="footer-tagline">⚜️ Fièrement produit au Québec ⚜️</p>
          <p className="footer-copyright">
            © {new Date().getFullYear()} Cabane Crête au Sirop. Tous droits réservés.
          </p>
          <div className="footer-contact-block">
            <p className="footer-contact-title">Contact</p>
            <p className="footer-contact">
              👑 Le Roi du Bouillage: Pier-Luc Crête<br />
              📱 Allô-Érable: (819) 740-2194<br />
              📧 Érabmail: pierluc.crete@gmail.com<br />
              📍 Sucrerie HQ: <a href="https://www.google.com/maps/search/?api=1&query=1580+chemin+des+Lacs+Tingwick+QC+J0A+1L0" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>1580 chemin des Lacs, Tingwick, QC, J0A 1L0</a>
            </p>
          </div>
        </div>
      </footer>

      <div className="admin-fixed-corner">
        <span
          className="admin-subtle-link"
          onClick={adminAuth ? handleAdminPanelOpen : openLoginModal}
        >
          ⚙
        </span>
        <span
          className="admin-subtle-link"
          onClick={openResetModal}
          title="Mot de passe oublié?"
        >
          🔒
        </span>
      </div>

      {/* Admin Panel Modal */}
      {adminOpen && adminAuth && (
        <div className="admin-overlay" onClick={() => setAdminOpen(false)}>
          <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
            <div className="admin-header">
              <h2>Panneau d'administration</h2>
              <button className="admin-close-btn" onClick={() => setAdminOpen(false)}>✕</button>
            </div>
            <div className="admin-oos-toggle">
              <button
                className={`admin-toggle-btn${outOfStock ? ' admin-toggle-off' : ' admin-toggle-on'}`}
                onClick={toggleOutOfStock}
              >
                {outOfStock ? 'Hors saison' : 'En saison'}
              </button>
              <button
                className={`admin-toggle-btn${notifEnabled ? ' admin-toggle-on' : ' admin-toggle-off'}`}
                onClick={toggleNotifications}
              >
                {notifEnabled ? 'Notifications' : 'Notifications'}
              </button>
              {newReservationCount > 0 && (
                <span className="admin-notif-new-badge">
                  {newReservationCount} nouvelle{newReservationCount > 1 ? 's' : ''}
                </span>
              )}
              <button className="admin-export-btn" onClick={() => setShowExportFilters(f => !f)}>
                CSV
              </button>
              <button className="admin-export-btn" onClick={() => setShowSecuritySetup(s => !s)}>
                🔐 Question Sécurité
              </button>
              <button className="admin-export-btn" onClick={() => setShowChangePassword(s => !s)}>
                🔑 Mot de passe
              </button>
              <button
                className="admin-toggle-btn admin-toggle-on"
                onClick={handleAdminLogout}
              >
                Connecté
              </button>
            </div>
            {showSecuritySetup && (
              <div className="admin-export-filters">
                <form onSubmit={handleSecuritySetup} style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', padding: '0.5rem 1rem' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                    {securityConfigured
                      ? '✓ Une question de sécurité est configurée. Vous pouvez la modifier ci-dessous.'
                      : '⚠ Aucune question de sécurité configurée. Configurez-en une pour permettre la réinitialisation du mot de passe.'}
                  </p>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, fontSize: '0.85rem' }}>
                    Question de sécurité
                    <input
                      type="text"
                      value={securityQuestion}
                      onChange={e => setSecurityQuestion(e.target.value)}
                      placeholder="Ex: Quel est le nom de notre cabane?"
                      required
                      style={{ width: '100%', padding: '8px 10px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, fontSize: '0.85rem' }}>
                    Réponse (sera enregistrée sans majuscules)
                    <input
                      type="text"
                      value={securityAnswer}
                      onChange={e => setSecurityAnswer(e.target.value)}
                      placeholder="Votre réponse secrète"
                      required
                      style={{ width: '100%', padding: '8px 10px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </label>
                  {securitySetupMsg && (
                    <p className={`admin-password-msg ${securitySetupMsg.startsWith('✓') ? 'success' : 'error'}`}>
                      {securitySetupMsg}
                    </p>
                  )}
                  <button type="submit" className="admin-export-btn" style={{ alignSelf: 'flex-start' }}>
                    💾 Enregistrer la question
                  </button>
                </form>
              </div>
            )}
            {showChangePassword && (
              <div className="admin-export-filters">
                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', padding: '0.5rem 1rem' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                    Changez votre mot de passe administrateur. Le nouveau mot de passe doit contenir au moins 8 caractères.
                  </p>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, fontSize: '0.85rem' }}>
                    Mot de passe actuel
                    <input
                      type="password"
                      value={cpCurrentPassword}
                      onChange={e => setCpCurrentPassword(e.target.value)}
                      placeholder="Votre mot de passe actuel"
                      required
                      style={{ width: '100%', padding: '8px 10px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, fontSize: '0.85rem' }}>
                    Nouveau mot de passe
                    <input
                      type="password"
                      value={cpNewPassword}
                      onChange={e => setCpNewPassword(e.target.value)}
                      placeholder="Au moins 8 caractères"
                      required
                      minLength={8}
                      style={{ width: '100%', padding: '8px 10px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, fontSize: '0.85rem' }}>
                    Confirmer le nouveau mot de passe
                    <input
                      type="password"
                      value={cpConfirmPassword}
                      onChange={e => setCpConfirmPassword(e.target.value)}
                      placeholder="Répétez le nouveau mot de passe"
                      required
                      minLength={8}
                      style={{ width: '100%', padding: '8px 10px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </label>
                  {cpMsg && (
                    <p className={`admin-password-msg ${cpMsg.startsWith('✓') ? 'success' : 'error'}`}>
                      {cpMsg}
                    </p>
                  )}
                  <button type="submit" className="admin-export-btn" style={{ alignSelf: 'flex-start' }} disabled={cpLoading}>
                    {cpLoading ? '⏳ Enregistrement...' : '💾 Changer le mot de passe'}
                  </button>
                </form>
              </div>
            )}
            <div className="admin-toolbar">
              <div className="admin-toolbar-left">
                {selectedReservations.size > 0 && (
                  <button className="admin-delete-btn" onClick={deleteSelectedReservations}>
                    🗑️ Supprimer ({selectedReservations.size})
                  </button>
                )}
              </div>
              {newReservationCount > 0 && (
                <span className="admin-count admin-new-count">
                  {newReservationCount} nouvelle{newReservationCount > 1 ? 's' : ''} réservation{newReservationCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {showExportFilters && (
              <div className="admin-export-filters">
                <div className="export-filter-row">
                  <label>
                    Du :
                    <input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)} />
                  </label>
                  <label>
                    Au :
                    <input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)} />
                  </label>
                  <label>
                    Statut :
                    <select value={exportStatut} onChange={e => setExportStatut(e.target.value)}>
                      <option value="Tous">Tous</option>
                      {STATUT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <button className="admin-export-btn" onClick={() => {
                    let filtered = reservations
                    if (exportDateFrom) {
                      filtered = filtered.filter(r => r.date >= exportDateFrom)
                    }
                    if (exportDateTo) {
                      const toEnd = exportDateTo + 'T23:59:59'
                      filtered = filtered.filter(r => r.date <= toEnd)
                    }
                    if (exportStatut !== 'Tous') {
                      filtered = filtered.filter(r => r.statut === exportStatut)
                    }
                    exportCSV(filtered)
                  }}>
                    📥 Télécharger CSV ({(() => {
                      let filtered = reservations
                      if (exportDateFrom) filtered = filtered.filter(r => r.date >= exportDateFrom)
                      if (exportDateTo) filtered = filtered.filter(r => r.date <= exportDateTo + 'T23:59:59')
                      if (exportStatut !== 'Tous') filtered = filtered.filter(r => r.statut === exportStatut)
                      return filtered.length
                    })()})
                  </button>
                  <button className="admin-reset-filters-btn" onClick={() => { setExportDateFrom(''); setExportDateTo(''); setExportStatut('Tous'); }}>
                    Réinitialiser
                  </button>
                </div>
              </div>
            )}
            {reservations.length > 0 && (
              <div className="admin-status-tally">
                {STATUT_OPTIONS.map(statut => {
                  const count = reservations.filter(r => r.statut === statut).length
                  return (
                    <div key={statut} className={`admin-tally-item${count === 0 ? ' admin-tally-zero' : ''}`}>
                      <span className="admin-tally-count">{count}</span>
                      <span className="admin-tally-label">{statut}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="admin-table-wrap">
              {reservations.length === 0 ? (
                <p className="admin-empty">Aucune réservation pour le moment.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th className="admin-th-check">
                        <input
                          type="checkbox"
                          className="admin-checkbox"
                          checked={reservations.length > 0 && selectedReservations.size === reservations.length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>N°</th>
                      <th>Date et heure</th>
                      <th>Nom</th>
                      <th>Téléphone</th>
                      <th>Courriel</th>
                      <th>Produits</th>
                      <th>Quantité</th>
                      <th>Instructions</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map(r => (
                      <tr key={r.numero} className={selectedReservations.has(r.numero) ? 'admin-row-selected' : ''}>
                        <td className="admin-td-check">
                          <input
                            type="checkbox"
                            className="admin-checkbox"
                            checked={selectedReservations.has(r.numero)}
                            onChange={() => toggleReservationSelect(r.numero)}
                          />
                        </td>
                        <td className="admin-td-numero">{formatNumero(r.numero)}</td>
                        <td className="admin-td-date">{formatDateTime(r.date)}</td>
                        <td>{r.nom}</td>
                        <td>{r.telephone}</td>
                        <td>{r.courriel}</td>
                        <td className="admin-td-produits">
                          {r.produits && Array.isArray(r.produits) ? (
                            r.produits.map((p, i) => (
                              <div key={i} className="admin-produit-line">
                                {p.nom}
                              </div>
                            ))
                          ) : (
                            r.categorie || '—'
                          )}
                        </td>
                        <td className="admin-td-quantite">
                          {r.produits && Array.isArray(r.produits) ? (
                            r.produits.map((p, i) => (
                              <div key={i} className="admin-produit-line">
                                {p.quantite}
                              </div>
                            ))
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="admin-td-instructions">{r.instructions || '—'}</td>
                        <td>
                          <select
                            className="admin-statut-select"
                            value={r.statut}
                            onChange={(e) => updateReservationStatut(r.numero, e.target.value)}
                          >
                            {STATUT_OPTIONS.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {showLoginModal && !adminAuth && (
        <div className="admin-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="admin-reset-panel" onClick={(e) => e.stopPropagation()}>
            <div className="admin-header">
              <h2>Connexion administrateur</h2>
              <button className="admin-close-btn" onClick={() => setShowLoginModal(false)}>✕</button>
            </div>
            <div className="admin-reset-body">
              <form onSubmit={handleAdminLogin}>
                <div className="admin-reset-fields">
                  <label>Mot de passe</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Mot de passe administrateur"
                    required
                    autoFocus
                  />
                </div>
                {loginError && <p className="admin-password-msg error">{loginError}</p>}
                <div className="admin-login-actions">
                  <button type="submit" className="admin-reset-submit" disabled={adminLoading}>
                    {adminLoading ? 'Connexion…' : 'Se connecter'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal (security question) */}
      {showResetModal && (
        <div className="admin-overlay" onClick={() => setShowResetModal(false)}>
          <div className="admin-reset-panel" onClick={(e) => e.stopPropagation()}>
            <div className="admin-header">
              <h2>Réinitialisation du mot de passe</h2>
              <button className="admin-close-btn" onClick={() => setShowResetModal(false)}>✕</button>
            </div>
            <div className="admin-reset-body">
              {resetSuccess ? (
                <form onSubmit={handleResetNewPassword}>
                  <div className="admin-reset-fields">
                    <p className="admin-password-msg success" style={{ marginBottom: '0.75rem' }}>
                      ✓ Question vérifiée! Définissez un nouveau mot de passe.
                    </p>
                    <label>Nouveau mot de passe</label>
                    <input
                      type="password"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="Au moins 8 caractères"
                      required
                      minLength={8}
                      autoFocus
                    />
                    <label>Confirmer le mot de passe</label>
                    <input
                      type="password"
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      placeholder="Répétez le mot de passe"
                      required
                      minLength={8}
                    />
                  </div>
                  {resetNewPwError && <p className="admin-password-msg error">{resetNewPwError}</p>}
                  <button type="submit" className="admin-reset-submit" disabled={resetNewPwLoading}>
                    {resetNewPwLoading ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
                  </button>
                </form>
              ) : resetLoading && !resetQuestion ? (
                <p style={{ textAlign: 'center' }}>Chargement…</p>
              ) : !resetQuestion && resetError ? (
                <p className="admin-password-msg error">{resetError}</p>
              ) : (
                <form onSubmit={handleResetSubmit}>
                  <div className="admin-reset-fields">
                    <label>Question de sécurité</label>
                    <p className="admin-security-question-display">{resetQuestion}</p>
                    <label>Votre réponse</label>
                    <input
                      type="text"
                      value={resetAnswer}
                      onChange={(e) => setResetAnswer(e.target.value)}
                      placeholder="Entrez votre réponse"
                      required
                      autoFocus
                    />
                  </div>
                  {resetError && <p className="admin-password-msg error">{resetError}</p>}
                  <button type="submit" className="admin-reset-submit" disabled={resetLoading}>
                    {resetLoading ? 'Vérification…' : 'Réinitialiser'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
