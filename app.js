/* =================================
   SMART SCHOOL MANAGER
   Supabase Authentication & Registration
================================= */

// SUPABASE CONNECTION

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


// CLOSE MENU AFTER CLICKING A LINK

document.querySelectorAll("#navigation a").forEach(link => {
    link.addEventListener("click", () => {
        document.getElementById("navigation")
            .classList.remove("active");
    });
});


// DISPLAY MESSAGES

function showMessage(element, message, color) {
    if (element) {
        element.textContent = message;
        element.style.color = color;
    }
}


// REGISTER SCHOOL AFTER AUTHENTICATION

async function submitSchoolRegistration(user) {

    const schoolData = JSON.parse(
        sessionStorage.getItem("pendingSchoolRegistration") || "null"
    );

    if (!schoolData) {
        return false;
    }

    const { data, error } = await db
        .from("schools")
        .insert({
            school_name: schoolData.school_name,
            school_email: schoolData.school_email,
            phone: schoolData.phone,
            address: schoolData.address,
            school_type: schoolData.school_type,
            created_by: user.id,
            approval_status: "pending"
        })
        .select()
        .single();

    if (error) {
        console.error(error);
        throw error;
    }

    sessionStorage.removeItem("pendingSchoolRegistration");

    return data;
}


// SCHOOL REGISTRATION FORM

const registrationForm = document.getElementById("registrationForm");

if (registrationForm) {

    registrationForm.addEventListener("submit", async function(event) {

        event.preventDefault();

        const message = document.getElementById("registrationMessage");

        const schoolName = document.getElementById("schoolName").value.trim();
        const schoolEmail = document.getElementById("schoolEmail").value.trim();
        const schoolPhone = document.getElementById("schoolPhone").value.trim();
        const schoolAddress = document.getElementById("schoolAddress").value.trim();
        const schoolType = document.getElementById("schoolType").value;

        const adminName = document.getElementById("adminName").value.trim();
        const adminEmail = document.getElementById("adminEmail").value.trim();
        const adminPassword = document.getElementById("adminPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (
            !schoolName || !schoolEmail || !schoolPhone ||
            !schoolAddress || !schoolType ||
            !adminName || !adminEmail || !adminPassword ||
            !confirmPassword
        ) {
            showMessage(message, "Please complete all registration fields.", "red");
            return;
        }

        if (adminPassword.length < 6) {
            showMessage(message, "Password must contain at least 6 characters.", "red");
            return;
        }

        if (adminPassword !== confirmPassword) {
            showMessage(message, "Passwords do not match.", "red");
            return;
        }

        const schoolData = {
            school_name: schoolName,
            school_email: schoolEmail,
            phone: schoolPhone,
            address: schoolAddress,
            school_type: schoolType
        };

        sessionStorage.setItem(
            "pendingSchoolRegistration",
            JSON.stringify(schoolData)
        );

        const button = registrationForm.querySelector('[type="submit"]');

        if (button) button.disabled = true;

        showMessage(message, "Creating your administrator account...", "#1769aa");

        try {

            const { data, error } = await db.auth.signUp({

                email: adminEmail,

                password: adminPassword,

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
                    message,
                    "Registration successful! Your school application is awaiting platform owner approval.",
                    "green"
                );

                registrationForm.reset();

            } else {

                showMessage(
                    message,
                    "Account created! Check your email to verify your account. After verification, log in to complete your school registration.",
                    "#1769aa"
                );

            }

        } catch (error) {

            console.error(error);

            showMessage(
                message,
                "Registration failed: " + error.message,
                "red"
            );

            if (error.message.toLowerCase().includes("already registered")) {
                sessionStorage.removeItem("pendingSchoolRegistration");
            }

        } finally {

            if (button) button.disabled = false;

        }

    });

}


// LOGIN FORM

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", async function(event) {

        event.preventDefault();

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;

        const message = document.getElementById("loginMessage");

        if (!email || !password) {
            showMessage(message, "Please enter your email and password.", "red");
            return;
        }

        const button = loginForm.querySelector('[type="submit"]');

        if (button) button.disabled = true;

        showMessage(message, "Signing in...", "#1769aa");

        try {

            const { data, error } = await db.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            const user = data.user;

            // COMPLETE PENDING SCHOOL REGISTRATION

            const pendingSchool = sessionStorage.getItem(
                "pendingSchoolRegistration"
            );

            if (pendingSchool) {

                await submitSchoolRegistration(user);

                showMessage(
                    message,
                    "School registration completed successfully. Your application is awaiting approval.",
                    "green"
                );

                loginForm.reset();

                return;
            }

            // CHECK PLATFORM OWNER STATUS

            const { data: profile, error: profileError } = await db
                .from("profiles")
                .select("is_platform_owner")
                .eq("id", user.id)
                .single();

            if (profileError) throw profileError;

            if (profile.is_platform_owner) {

                window.location.href = "owner.html";
                return;

            }

            showMessage(
                message,
                "Login successful. Your school administrator dashboard will be available after school approval.",
                "green"
            );

        } catch (error) {

            console.error(error);

            showMessage(
                message,
                "Login failed: " + error.message,
                "red"
            );

        } finally {

            if (button) button.disabled = false;

        }

    });

}


// CURRENT YEAR

const footerYear = document.querySelector("footer small");

if (footerYear) {
    footerYear.textContent =
        "© " + new Date().getFullYear() +
        " SMART SCHOOL MANAGER. All Rights Reserved.";
}


// APPLICATION STATUS

console.log("SMART SCHOOL MANAGER connected to Supabase.");
