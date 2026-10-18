# NutriTrack 🥗

Application web installable (PWA) pour :

- **Calculer ton quota de calories** à partir de ton sexe, âge, taille, poids, % de masse grasse et niveau d'activité.
- Voir en un coup d'œil tes calories pour une **sèche 🔥**, un **maintien ⚖️** ou une **prise de masse 💪**, avec les macros (protéines / glucides / lipides) et le rythme de perte ou de prise par semaine.
- **Noter ce que tu manges chaque jour** (base d'aliments, saisie manuelle ou **photo analysée par IA**).
- Suivre ton **eau**, ton **poids** (courbe et tendance) et ton historique dans un **calendrier**.

Tout est **gratuit** et tes données restent **sur ton téléphone** (stockage local du navigateur, aucun serveur).

---

## 📲 Mettre l'app sur ton téléphone (gratuit)

L'app est un simple site statique. Il suffit de la mettre en ligne, puis de l'« installer » depuis le navigateur : elle aura sa propre icône et s'ouvrira en plein écran, comme une app de l'App Store.

> ⚠️ **GitHub Pages ne marche gratuitement qu'avec un dépôt public.** Pour un dépôt **privé**, GitHub Pages demande l'abonnement payant GitHub Pro.
> Pour rester gratuit **et** privé, utilise **Cloudflare Pages** (option A).

### Étape 1 – Mettre le code sur GitHub (dépôt privé)

1. Crée un compte sur [github.com](https://github.com) si besoin.
2. Clique sur **New repository** → nom : `nutritrack` → coche **Private** → **Create repository**.
3. Dans le Terminal, depuis ce dossier :

```bash
cd ~/Desktop/appnutrition && git init && git add . && git commit -m "NutriTrack" && git branch -M main
```

```bash
git remote add origin https://github.com/TON-PSEUDO/nutritrack.git && git push -u origin main
```

(Remplace `TON-PSEUDO` par ton nom d'utilisateur GitHub.)

### Étape 2 – Mettre en ligne

**Option A – Cloudflare Pages (recommandé : gratuit, dépôt privé OK)**

1. Crée un compte gratuit sur [pages.cloudflare.com](https://pages.cloudflare.com).
2. **Workers & Pages → Create → Pages → Connect to Git** → autorise GitHub → choisis `nutritrack`.
3. Build settings : *Framework preset* = **None**, *Build command* = vide, *Build output directory* = `/`.
4. **Save and Deploy**. Tu obtiens une adresse du type `https://nutritrack-xxx.pages.dev`.

Chaque `git push` met l'app à jour automatiquement. (Netlify ou Vercel marchent aussi, gratuitement, de la même façon.)

**Option B – GitHub Pages (gratuit seulement si le dépôt est public)**

Repo → **Settings → Pages** → *Source* : `Deploy from a branch` → `main` / `/ (root)` → **Save**.
Adresse : `https://TON-PSEUDO.github.io/nutritrack/`.
Le code devient visible, mais **pas tes données** : elles ne quittent jamais ton téléphone.

### Étape 3 – Installer l'app

- **iPhone** : ouvre l'adresse dans **Safari** → bouton **Partager** ⬆️ → **« Sur l'écran d'accueil »**.
- **Android** : ouvre l'adresse dans **Chrome** → menu ⋮ → **« Installer l'application »** (ou le bouton *Installer* dans l'app).

L'app fonctionne ensuite **hors connexion** (sauf l'analyse photo, qui a besoin d'internet).

---

## 📷 Analyse photo des plats (IA)

Par défaut, l'app utilise **Google Gemini**, **gratuit** et sans carte bancaire :

1. Va sur [aistudio.google.com](https://aistudio.google.com) avec ton compte Google.
2. Clique sur **Get API key → Create API key** et copie la clé.
3. Dans l'app : **Profil → Analyse photo IA** → colle la clé → **Enregistrer**.

Ensuite : **+ → Photo IA** → prends ton plat en photo. L'IA liste les aliments, estime les grammes et les calories ; tu peux corriger avant d'ajouter.

Bon à savoir :
- L'offre gratuite de Google a un **quota** (quelques dizaines de photos par jour, largement suffisant pour un usage perso). Si le quota est atteint, réessaie plus tard.
- Avec l'offre gratuite, Google peut utiliser les photos envoyées pour améliorer ses services.
- Si un jour le modèle `gemini-flash-latest` n'existe plus, remplace le nom du modèle dans **Profil** par celui indiqué sur AI Studio.
- L'option **Claude (Anthropic)** existe aussi, mais elle est **payante** (crédit prépayé sur console.anthropic.com). Tu n'en as pas besoin.
- Une estimation sur photo reste approximative (±20 %). Pour être précis, pèse et utilise la base d'aliments.

La clé API reste uniquement sur ton téléphone. Elle n'est **jamais** incluse dans les exports.

---

## 🔔 Rappels (eau et repas)

Dans **Profil → Rappels**, choisis tes heures de repas et la fréquence des rappels d'eau.

- **Notifications de l'app** : coche « Activer les notifications ». Sur iPhone, ça ne marche que si l'app est installée sur l'écran d'accueil. Attention : une web app **ne peut pas envoyer de notification quand elle est fermée** (il faudrait un serveur payant).
- **Rappels fiables, même app fermée** : touche **« Ajouter au Calendrier »**. Tes rappels deviennent des événements quotidiens avec alerte dans l'app Calendrier du téléphone. Si tu changes tes horaires, supprime l'ancien calendrier « NutriTrack » puis ajoute-le à nouveau.

## 🔥 Calories dépensées (app Santé)

Apple ne permet pas à une web app de lire l'app Santé directement. On passe donc par l'app **Raccourcis**, à configurer une seule fois :

1. App **Raccourcis** → **+** → nomme le raccourci exactement **NutriTrack Santé**.
2. Action **« Rechercher des échantillons de santé »** : Type = **Énergie active**, filtre **Date de début** → **est aujourd'hui**.
3. Action **« Calculer les statistiques »** → **Somme**.
4. Action **« Copier dans le presse-papiers »**.

Ensuite, dans NutriTrack : carte **🔥 Calories dépensées** → **⚡ Raccourci Santé**. Reviens dans l'app (◀ en haut à gauche), puis touche **📋 Coller** et **Enregistrer**.
Tu peux aussi taper le chiffre à la main (Santé → Parcourir → Activité → Énergie active), ou sur Android le recopier depuis Google Fit / Samsung Health.

Avec ta dépense du jour, l'objectif devient **dynamique** : métabolisme de base + 10 % (digestion) + calories actives, puis −/+ % selon ton objectif (sèche, prise de masse). Tu peux désactiver ça dans **Profil → Dépense réelle**.

---

## 🧮 Comment sont faits les calculs

| Élément | Méthode |
|---|---|
| Métabolisme de base | **Mifflin-St Jeor**, ou **Katch-McArdle** si tu donnes ton % de masse grasse (plus précis) |
| % de masse grasse sans balance | Méthode **US Navy** (tour de taille, cou, hanches) |
| Dépense totale (maintien) | Métabolisme de base × facteur d'activité (1,2 à 1,9) |
| Sèche | −10 % (douce), −20 % (modérée), −25 % (rapide) |
| Prise de masse | +5 % (douce), +10 % (modérée), +15 % (rapide) |
| Protéines | 1,8 à 2,2 g/kg selon l'objectif (calculées sur la masse maigre si le % de masse grasse est connu) |
| Lipides | 25 % des calories (minimum 0,8 g/kg) |
| Glucides | Le reste des calories |

Chaque nouvelle pesée met à jour ton poids, et donc ton quota, en temps réel. L'onglet Poids te dit si ta tendance colle à ton objectif (et de combien ajuster).

> Ce sont des estimations. Elles ne remplacent pas l'avis d'un médecin ou d'un diététicien.

---

## 💾 Sauvegarde

Les données sont stockées dans le navigateur du téléphone. Pense à faire **Profil → Exporter** de temps en temps (avant de changer de téléphone, par exemple) et **Importer** pour tout récupérer.

## 🛠️ Tester sur l'ordinateur

```bash
cd ~/Desktop/appnutrition && python3 -m http.server 8765
```

Puis ouvre http://localhost:8765.

Après une modification du code, incrémente `VERSION` dans `sw.js` pour que les téléphones récupèrent la mise à jour.
