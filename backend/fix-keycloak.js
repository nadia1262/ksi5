// Final fix: set attributes properly by merging with existing user data
async function fix() {
    const t = await (await fetch('http://localhost:8080/realms/master/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'admin', password: 'admin' }),
    })).json();
    const h = { 'Authorization': `Bearer ${t.access_token}`, 'Content-Type': 'application/json' };

    const configs = {
        'operator-jaksel': { tenant_id: '3174', email: 'jaksel@bps.go.id', firstName: 'Operator', lastName: 'Jaksel' },
        'operator-jakpus': { tenant_id: '3171', email: 'jakpus@bps.go.id', firstName: 'Operator', lastName: 'Jakpus' },
        'operator-bogor':  { tenant_id: '3201', email: 'bogor@bps.go.id', firstName: 'Operator', lastName: 'Bogor' },
    };

    const usersRes = await fetch('http://localhost:8080/admin/realms/zt-realm/users?max=10', { headers: h });
    const users = await usersRes.json();

    for (const u of users) {
        const cfg = configs[u.username];
        if (!cfg) continue;

        // GET full user first, then merge
        const fullUserRes = await fetch(`http://localhost:8080/admin/realms/zt-realm/users/${u.id}`, { headers: h });
        const fullUser = await fullUserRes.json();

        // Merge attributes
        const updatedUser = {
            ...fullUser,
            email: cfg.email,
            emailVerified: true,
            firstName: cfg.firstName,
            lastName: cfg.lastName,
            requiredActions: [],
            attributes: {
                ...(fullUser.attributes || {}),
                tenant_id: [cfg.tenant_id],
            },
        };

        const putRes = await fetch(`http://localhost:8080/admin/realms/zt-realm/users/${u.id}`, {
            method: 'PUT', headers: h, body: JSON.stringify(updatedUser),
        });
        console.log(`${u.username}: PUT status=${putRes.status}`);

        // Verify attributes are set
        const verifyRes = await fetch(`http://localhost:8080/admin/realms/zt-realm/users/${u.id}`, { headers: h });
        const verified = await verifyRes.json();
        console.log(`  attributes:`, JSON.stringify(verified.attributes));
    }

    // Test all logins
    console.log('\n--- Login Tests ---');
    for (const username of Object.keys(configs)) {
        const testRes = await fetch('http://localhost:8080/realms/zt-realm/protocol/openid-connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'password', client_id: 'zt-client', username, password: 'password' }),
        });
        if (testRes.ok) {
            const data = await testRes.json();
            const payload = JSON.parse(atob(data.access_token.split('.')[1]));
            console.log(`✅ ${username}: tenant_id=${payload.tenant_id}`);
        } else {
            const err = await testRes.json();
            console.log(`❌ ${username}: ${err.error_description}`);
        }
    }
}

fix().catch(console.error);
