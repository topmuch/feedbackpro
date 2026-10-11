// ============================================================
// FeedbackPro - Envoi de SMS via l'API REST Twilio (Session 6 §2)
// ------------------------------------------------------------
// Utilise fetch + Basic auth (PAS le SDK Twilio) pour rester
// léger et compatible Edge/Node.
//
// Variables d'environnement requises (toutes optionnelles) :
//   TWILIO_SID    - Account SID Twilio (ACxxxxxxxx)
//   TWILIO_TOKEN  - Auth Token Twilio
//   TWILIO_PHONE  - Numéro émetteur Twilio (E.164, ex: +33612345678)
//
// MODE DÉMO : si l'une de ces variables est absente, le SMS est
// simulé (log serveur) et la fonction renvoie true — le flux
// principal de l'application n'est JAMAIS interrompu.
// ============================================================

const TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts"

export async function sendSMS(to: string, message: string): Promise<boolean> {
  try {
    const sid = process.env.TWILIO_SID
    const token = process.env.TWILIO_TOKEN
    const from = process.env.TWILIO_PHONE

    // ---------- Mode démo : clés absentes ----------
    if (!sid || !token || !from || !to) {
      console.log(`📱 SMS simulé (mode démo) → ${to || "numéro non configuré"} : ${message}`)
      return true
    }

    // ---------- Normalisation du destinataire en E.164 ----------
    // La base stocke les numéros sans "+" (ex: 33612345678).
    const destinataire = to.startsWith("+") ? to : `+${to.replace(/[^0-9]/g, "")}`

    // ---------- Appel REST Twilio ----------
    const body = new URLSearchParams({ From: from, To: destinataire, Body: message })
    const auth = Buffer.from(`${sid}:${token}`).toString("base64")

    const res = await fetch(`${TWILIO_API}/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      console.error(`Erreur Twilio (${res.status}) : ${detail.slice(0, 300)}`)
      return false
    }

    return true
  } catch (e) {
    // Un échec SMS ne doit jamais casser le flow principal (retour client, cron…)
    console.error("Erreur sendSMS (non bloquante)", e)
    return false
  }
}
