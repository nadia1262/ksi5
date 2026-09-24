package authz

import future.keywords.in

# --- 1. DEFAULT VALUES ---
# Prinsip utama Zero Trust: Default to Deny
default allow = false
default risk_score = 0
default block_reason = ""

# --- 2. HARD VIOLATION LOGIC (BOLA Detection) ---
# Membandingkan tenant_id yang ada di JWT (Identitas) dengan tenant_id dari URL API (Resource)
# Bobot: +50 (Hard Violation - Kontrol Mitigasi BOLA, Mao dkk., 2025)
is_hard_violation {
    not input.jwt.tenant_id
}

is_hard_violation {
    input.jwt.tenant_id != input.resource.tenant_id
}

hard_violation_score = 50 {
    is_hard_violation
} else = 0

# --- 3. SOFT VIOLATION LOGIC (Contextual Signals - NIST SP 800-207 & Kostiuk dkk., 2026) ---
# 1. Unknown IP Address: Bobot +20 (Sinyal Kontekstual Jaringan)
score_unknown_ip = 20 {
    input.context.is_new_ip == true
} else = 0

# 2. Unusual Access Time: Bobot +10 (Karakteristik Perilaku Waktu Akses)
score_unusual_time = 10 {
    input.context.is_off_hours == true
} else = 0

# 3. Velocity Exceeded: Bobot +15 (Deteksi Automated Enumeration / Mao dkk., 2025)
score_velocity_exceeded = 15 {
    input.context.is_high_velocity == true
} else = 15 {
    input.context.velocity_count > 10
} else = 0

soft_violation_score = score_unknown_ip + score_unusual_time + score_velocity_exceeded

# --- 4. RISK SCORING CALCULATION ---
# Akumulasi skor risiko: Hard Violation (+50) + Soft Violations (+20, +10, +15)
risk_score = hard_violation_score + soft_violation_score

# --- 5. ENFORCEMENT DECISION ---
# Request diizinkan HANYA JIKA tidak ada Hard Violation DAN Skor di bawah Threshold (50)
allow {
    not is_hard_violation
    risk_score < 50
}

# Penentuan alasan penolakan untuk dikirim ke Log SOC Dashboard
block_reason = "Hard Violation: Tenant Mismatch (BOLA Detected)" {
    is_hard_violation
} else = "Soft Violation: Risk Score Threshold Exceeded" {
    not is_hard_violation
    risk_score >= 50
} else = "None" {
    allow
}
