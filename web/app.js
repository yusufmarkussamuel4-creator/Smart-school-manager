/* =================================
   SMART SCHOOL MANAGER
   MAIN APPLICATION
================================= */

// SUPABASE CONNECTION

if (!window.supabase || !window.SUPABASE_CONFIG) {
    console.error("Supabase configuration or library not loaded.");
    alert("Application connection error. Please refresh the page.");
    throw new Error("Supabase configuration missing.");
}

const db = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);


// MOBILE NAVIGATION

function toggleMenu() {
    const navigation = document.getElementById("navigation");

    if (navigation) {
        navigation.classList.toggle("active");
    }
}


// CLOSE MOBILE MENU

document.querySelectorAll("#navigation a").forEach(link => {
    link.addEventListener("click", () => {
        document.getElementById("navigation")
            ?.classList.remove("active");
    });
});


// MESSAGE DISPLAY

function showMessage(element, message, color) {
    if (element) {
        element.textContent = message;
        element.style.color = color;
    }
}


// COMPLETE SCHOOL REGISTRATION

async function submitSchoolRegistration(user) {

    const schoolData = JSON.parse(
        sessionStorage.getItem("pendingSchoolRegistration") || "null"
    );

    if (!schoolData) {
        throw new Error("School registration information not found.");
    }

    const { error } = await db
        .from("schools")
        .insert({
            school_name: schoolData.school_name,
            school_email: schoolData.school_email,
            phone: schoolData.phone,
            address: schoolData.address,
            school_type: schoolData.school_type,
            created_by: user.id,
            approval_status: "pending"
        });

    if (error) throw error;

    sessionStorage.removeItem("pendingSchoolRegistration");

    return true;
}


// SCHOOL REGISTRATION

const registrationForm = document.getElementById("registrationForm");

if (registrationForm) {

    registrationForm.addEventListener("submit", async function(event) {

        event.preventDefault();

        const message = document.getElementById("registrationMessage");

        const schoolData = {
            school_name: document.getElementById("schoolName").value.trim(),
            school_email: document.getElementById("schoolEmail").value.trim(),
            phone: document.getElementById("schoolPhone").value.trim(),
            address: document.getElementById("schoolAddress").value.trim(),
            school_type: document.getElementById("schoolType").value
        };

        const adminName = document.getElementById("adminName").value.trim();
        const adminEmail = document.getElementById("adminEmail").value.trim();
        const password = document.getElementById("adminPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (password.length < 8) {
            showMessage(message, "Password must contain at least 8 characters.", "red");
            return;
        }

        if (password !== confirmPassword) {
            showMessage(message, "Passwords do not match.", "red");
            return;
        }

        sessionStorage.setItem(
            "pendingSchoolRegistration",
            JSON.stringify(schoolData)
        );

        const button = registrationForm.querySelector('[type="submit"]');

        button.disabled = true;

        showMessage(message, "Creating administrator account...", "#1769aa");

        try {

            const { data, error } = await db.auth.signUp({

                email: adminEmail,

                password: password,

                options: {
                    data: {
                        full_name: adminName
                    }
                }

            });

            if (error) throw error;

            if (data.session && data.user) {

                await submitSchoolRegistration(data.user);

                showMessage(
                  const { data: memberships, error: membershipError } = await db
    .from("school_memberships")
    .select("school_id, role")
    .eq("user_id", data.user.id)
    .eq("role", "school_admin");

if (membershipError) throw membershipError;

if (!memberships || memberships.length === 0) {
    throw new Error("No school administrator membership found.");
}

const schoolIds = memberships.map(item => item.school_id);

const { data: schools, error: schoolError } = await db
    .from("schools")
    .select("id, approval_status")
    .in("id", schoolIds);

if (schoolError) throw schoolError;

const approvedSchool = schools.find(
    school => school.approval_status === "approved"
);

if (approvedSchool) {
    window.location.href = "admin.html";
    return;
}

    message,
    "Your school is awaiting platform approval.",
    "#1769aa"
);  

                registrationForm.reset();

            } else {

                showMessage(
                    message,
                    "Account created! Check your email, verify your account, and then log in to complete school registration.",
                    "#1769aa"
                );

            }

        } catch (error) {

            console.error("Registration error:", error);

            showMessage(
                message,
                "Registration failed: " + error.message,
                "red"
            );

        } finally {

            button.disabled = false;

        }

    });

}


// LOGIN

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", async function(event) {

        event.preventDefault();

        const message = document.getElementById("loginMessage");

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;

        const button = loginForm.querySelector('[type="submit"]');

        button.disabled = true;

        showMessage(message, "Signing in...", "#1769aa");

        try {

            const { data, error } = await db.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            if (sessionStorage.getItem("pendingSchoolRegistration")) {

                await submitSchoolRegistration(data.user);

                const { data: memberships, error: membershipError } = await db
    .from("school_memberships")
    .select("school_id, role")
    .eq("user_id", data.user.id)
    .eq("role", "school_admin");

if (membershipError) throw membershipError;

if (!memberships || memberships.length === 0) {
    throw new Error("No school administrator membership found.");
}

const schoolIds = memberships.map(item => item.school_id);

const { data: schools, error: schoolError } = await db
    .from("schools")
    .select("id, approval_status")
    .in("id", schoolIds);

if (schoolError) throw schoolError;

const approvedSchool = schools.find(
    school => school.approval_status === "approved"
);

if (approvedSchool) {
    window.location.href = "admin.html";
    return;
}

showMessage(
    message,
    "Your school is awaiting platform approval.",
    "#1769aa"
);

                loginForm.reset();
                return;
            }

            const { data: profile, error: profileError } = await db
                .from("profiles")
                .select("is_platform_owner")
                .eq("id", data.user.id)
                .single();

            if (profileError) throw profileError;

            if (profile.is_platform_owner) {
                window.location.href = "owner.html";
                return;
            }

            showMessage(
                message,
                "Login successful. Your school dashboard will be available after approval.",
                "green"
            );

        } catch (error) {

            console.error("Login error:", error);

            showMessage(
                message,
                "Login failed: " + error.message,
                "red"
            );

        } finally {

            button.disabled = false;

        }

    });

}


// FOOTER YEAR

const footerYear = document.querySelector("footer small");

if (footerYear) {
    footerYear.textContent =
        "© " + new Date().getFullYear() +
        " SMART SCHOOL MANAGER. All Rights Reserved.";
}


console.log("SMART SCHOOL MANAGER loaded successfully.");
