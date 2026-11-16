
/* =================================
   SMART SCHOOL MANAGER
   Main Application Functions
================================= */

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


// REGISTRATION FORM

const registrationForm = document.getElementById("registrationForm");

if (registrationForm) {

    registrationForm.addEventListener("submit", function(event) {

        event.preventDefault();

        const schoolName = document.getElementById("schoolName").value.trim();
        const schoolEmail = document.getElementById("schoolEmail").value.trim();
        const schoolPhone = document.getElementById("schoolPhone").value.trim();
        const schoolAddress = document.getElementById("schoolAddress").value.trim();
        const schoolType = document.getElementById("schoolType").value;

        const message = document.getElementById("registrationMessage");

        if (!schoolName || !schoolEmail || !schoolPhone ||
            !schoolAddress || !schoolType) {

            message.textContent = "Please complete all registration fields.";
            message.style.color = "red";

            return;
        }

        message.textContent =
            "Your form is ready. Online registration will be activated after database configuration.";

        message.style.color = "#1769aa";

    });

}


// LOGIN FORM

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", function(event) {

        event.preventDefault();

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;

        const message = document.getElementById("loginMessage");

        if (!email || !password) {

            message.textContent = "Please enter your email and password.";
            message.style.color = "red";

            return;
        }

        message.textContent =
            "Login will become available after Supabase authentication is configured.";

        message.style.color = "#1769aa";

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

console.log("SMART SCHOOL MANAGER interface loaded successfully.");
