package authz

import future.keywords.in

# --- 1. DEFAULT VALUES ---
# Prinsip utama Zero Trust: Default to Deny
default allow = false
default risk_score = 0
default block_reason = ""

# --- 2. HARD VIOLATION LOGIC (BOLA Detection) ---
# Membandingkan tenant_id yang ada di JWT (Identitas) dengan tenant_id dari URL API (Resource)
is_hard_violation {
    not input.jwt.tenant_id
}

is_hard_violation {
    input.jwt.tenant_id != input.resource.tenant_id
}

# --- 3. SOFT VIOLATION LOGIC (Contextual Signals) ---
# Kumpulan kondisi yang dicurigai (menambah risk score)
# Base score 0 agar sum() tidak gagal jika tidak ada pelanggaran
soft_violation_scores[score] {
    score := 0
}

soft_violation_scores[score] {
    input.context.is_new_ip == true
    score := 20
}

soft_violation_scores[score] {
    input.context.is_off_hours == true
    score := 10
}

soft_violation_scores[score] {
    input.context.velocity_count > 60
    score := 50
}

soft_violation_scores[score] {
    input.context.velocity_count > 30
    input.context.velocity_count <= 60
    score := 25
}

soft_violation_scores[score] {
    input.context.velocity_count > 10
    input.context.velocity_count <= 30
    score := 15
}

# --- 4. RISK SCORING CALCULATION ---
# Jika Hard Violation (BOLA), skor langsung mentok di angka mati (50)
risk_score = 50 {
    is_hard_violation
} else = total_score {
    not is_hard_violation
    total_score := sum([s | soft_violation_scores[s]])
}

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
