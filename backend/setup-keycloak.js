// ============================================
// setup-keycloak.js
// ============================================
// Script otomatis untuk mengkonfigurasi Keycloak:
// 1. Membuat Realm "zt-realm"
// 2. Membuat Client "zt-client" (Direct Access Grants / ROPC)
// 3. Menambahkan Protocol Mapper "tenant_id" ke JWT
// 4. Membuat 3 User (satu per Tenant: 3174, 3171, 3201)
// 5. Set password untuk setiap user
//
// Jalankan: node setup-keycloak.js

const KEYCLOAK_URL = 'http://localhost:8080';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin';
const REALM_NAME = 'zt-realm';
const CLIENT_ID = 'zt-client';

const USERS = [
    { username: 'operator-jaksel', password: 'password', tenant_id: '3174', fullName: 'Operator BPS Jakarta Selatan' },
    { username: 'operator-jakpus', password: 'password', tenant_id: '3171', fullName: 'Operator BPS Jakarta Pusat' },
    { username: 'operator-bogor', password: 'password', tenant_id: '3201', fullName: 'Operator BPS Kabupaten Bogor' },
];

async function main() {
    console.log('============================================');
    console.log(' 🔧 Keycloak Auto-Setup Script');
    console.log('============================================\n');

    // --- STEP 1: Dapatkan Admin Token ---
    console.log('[1/6] Mendapatkan Admin Access Token...');
    const tokenRes = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'password',
            client_id: 'admin-cli',
            username: ADMIN_USER,
            password: ADMIN_PASS,
        }),
    });

    if (!tokenRes.ok) {
        console.error('❌ Gagal login ke Keycloak Admin. Pastikan Keycloak sudah berjalan.');
        process.exit(1);
    }

    const { access_token } = await tokenRes.json();
    console.log('   ✅ Admin token berhasil didapatkan.\n');

    const headers = {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
    };

    // --- STEP 2: Buat Realm ---
    console.log(`[2/6] Membuat Realm "${REALM_NAME}"...`);
    const realmRes = await fetch(`${KEYCLOAK_URL}/admin/realms`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            realm: REALM_NAME,
            enabled: true,
            displayName: 'Zero Trust PoC Realm',
            accessTokenLifespan: 3600, // 1 jam
        }),
    });

    if (realmRes.status === 409) {
        console.log('   ⚠️  Realm sudah ada, skip.\n');
    } else if (realmRes.ok) {
        console.log('   ✅ Realm berhasil dibuat.\n');
    } else {
        const err = await realmRes.text();
        console.error('   ❌ Gagal membuat realm:', err);
    }

    // --- STEP 3: Buat Client ---
    console.log(`[3/6] Membuat Client "${CLIENT_ID}"...`);
    const clientRes = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            clientId: CLIENT_ID,
            name: 'Zero Trust PoC Client',
            enabled: true,
            publicClient: true,       // Public client (no secret needed for ROPC)
            directAccessGrantsEnabled: true,  // Enable ROPC flow
            standardFlowEnabled: false,
            serviceAccountsEnabled: false,
            protocol: 'openid-connect',
            redirectUris: ['http://localhost:5173/*', 'http://localhost:3000/*'],
            webOrigins: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'],
        }),
    });

    if (clientRes.status === 409) {
        console.log('   ⚠️  Client sudah ada, skip.\n');
    } else if (clientRes.ok) {
        console.log('   ✅ Client berhasil dibuat.\n');
    } else {
        const err = await clientRes.text();
        console.error('   ❌ Gagal membuat client:', err);
    }

    // --- STEP 4: Tambahkan Protocol Mapper untuk tenant_id ---
    console.log('[4/6] Menambahkan Protocol Mapper "tenant_id" ke JWT...');

    // Pertama, cari internal ID dari client kita
    const clientsListRes = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CLIENT_ID}`, {
        headers,
    });
    const clientsList = await clientsListRes.json();
    const internalClientId = clientsList[0]?.id;

    if (internalClientId) {
        const mapperRes = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${internalClientId}/protocol-mappers/models`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: 'tenant_id',
                protocol: 'openid-connect',
                protocolMapper: 'oidc-usermodel-attribute-mapper',
                config: {
                    'user.attribute': 'tenant_id',
                    'claim.name': 'tenant_id',
                    'jsonType.label': 'String',
                    'id.token.claim': 'true',
                    'access.token.claim': 'true',
                    'userinfo.token.claim': 'true',
                    'multivalued': 'false',
                    'aggregate.attrs': 'false',
                },
            }),
        });

        if (mapperRes.status === 409) {
            console.log('   ⚠️  Mapper sudah ada, skip.\n');
        } else if (mapperRes.ok) {
            console.log('   ✅ Protocol Mapper "tenant_id" berhasil ditambahkan ke JWT.\n');
        } else {
            const err = await mapperRes.text();
            console.error('   ❌ Gagal membuat mapper:', err);
        }
    }

    // --- STEP 4.5: Daftarkan Atribut tenant_id di User Profile (Keycloak 24+) ---
    try {
        const profileRes = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/profile`, { headers });
        if (profileRes.ok) {
            const profile = await profileRes.json();
            if (!profile.attributes.some(a => a.name === 'tenant_id')) {
                profile.attributes.push({
                    name: 'tenant_id',
                    displayName: 'Tenant ID',
                    permissions: { view: ['admin', 'user'], edit: ['admin'] },
                    multivalued: false,
                });
                const updateRes = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/profile`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(profile),
                });
                if (updateRes.ok) {
                    console.log('   ✅ Atribut tenant_id terdaftar di User Profile schema.\n');
                }
            }
        }
    } catch (e) {
        console.warn('   ⚠️  Gagal mengecek User Profile schema:', e.message);
    }

    // --- STEP 5: Buat Users ---
    console.log('[5/6] Membuat Users...');
    for (const user of USERS) {
        console.log(`   📝 Membuat/memperbarui user: ${user.username} (Tenant: ${user.tenant_id})...`);

        const userRes = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                username: user.username,
                enabled: true,
                firstName: user.fullName.split(' ').slice(0, 2).join(' '),
                lastName: user.fullName.split(' ').slice(2).join(' '),
                attributes: {
                    tenant_id: [user.tenant_id],
                },
                credentials: [{
                    type: 'password',
                    value: user.password,
                    temporary: false,
                }],
            }),
        });

        if (userRes.status === 409) {
            console.log(`      ⚠️  User "${user.username}" sudah ada, memastikan atribut tenant_id...`);
            // Update attributes if already exists
            const getU = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${user.username}`, { headers });
            const listU = await getU.json();
            if (listU && listU[0]) {
                const uId = listU[0].id;
                await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${uId}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        ...listU[0],
                        attributes: {
                            ...(listU[0].attributes || {}),
                            tenant_id: [user.tenant_id],
                        },
                    }),
                });
            }
        } else if (userRes.ok) {
            console.log(`      ✅ User "${user.username}" berhasil dibuat.`);
        } else {
            const err = await userRes.text();
            console.error(`      ❌ Gagal membuat user "${user.username}":`, err);
        }
    }

    // --- STEP 6: Verifikasi Semua User ---
    console.log('\n[6/6] Verifikasi: Mencoba login semua operator...');

    for (const user of USERS) {
        const testLoginRes = await fetch(`${KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'password',
                client_id: CLIENT_ID,
                username: user.username,
                password: user.password,
            }),
        });

        if (testLoginRes.ok) {
            const tokenData = await testLoginRes.json();
            const payload = JSON.parse(atob(tokenData.access_token.split('.')[1]));
            console.log(`   ✅ Login ${user.username} berhasil! tenant_id: ${payload.tenant_id}`);
        } else {
            const err = await testLoginRes.text();
            console.error(`   ❌ Login ${user.username} gagal:`, err);
        }
    }

    console.log('\n============================================');
    console.log(' ✅ Keycloak Setup Selesai!');
    console.log('============================================');
    console.log(`\n📌 Informasi Login:`);
    console.log(`   Keycloak Admin : http://localhost:8080/admin (admin/admin)`);
    console.log(`   Realm          : ${REALM_NAME}`);
    console.log(`   Client         : ${CLIENT_ID}`);
    console.log(`   Users          :`);
    USERS.forEach(u => {
        console.log(`     - ${u.username} / ${u.password}  (Tenant: ${u.tenant_id})`);
    });
    console.log('');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
