const db = window.supabase.createClient(
window.SUPABASE_CONFIG.URL,
window.SUPABASE_CONFIG.KEY
);

const $ = id => document.getElementById(id);

let currentUser = null;
let currentSchoolId = null;
let currentLogoUrl = null;
let selectedLogo = null;

function showMessage(message, isError = false) {
const box = $("statusMessage");
if (!box) return;

box.textContent = message;
box.style.color = isError ? "#b42318" : "#176b43";

}

function setPreview(url) {
const preview = $("logoPreview");
if (!preview) return;

if (url) {
    preview.src = url;
    preview.style.display = "block";
} else {
    preview.removeAttribute("src");
    preview.style.display = "none";
}

}

async function initializeSettings() {
try {
showMessage("Loading school information...");

    const { data: authData, error: authError } =
        await db.auth.getUser();

    if (authError || !authData.user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = authData.user;

    const { data: membership, error: membershipError } =
        await db
            .from("school_memberships")
            .select("school_id")
            .eq("user_id", currentUser.id)
            .eq("role", "school_admin")
            .limit(1)
            .maybeSingle();

    if (membershipError) throw membershipError;

    if (!membership) {
        throw new Error("No school administrator account was found.");
    }

    currentSchoolId = membership.school_id;

    const { data: school, error: schoolError } =
        await db
            .from("schools")
            .select("school_name, head_teacher_name, school_email, phone, address, logo_url")
            .eq("id", currentSchoolId)
            .single();

    if (schoolError) throw schoolError;

    $("schoolName").value = school.school_name || "";
    $("headTeacherName").value = school.head_teacher_name || "";
    $("schoolAddress").value = school.address || "";
    $("schoolPhone").value = school.phone || "";
    $("schoolEmail").value = school.school_email || "";

    currentLogoUrl = school.logo_url || null;
    setPreview(currentLogoUrl);

    showMessage("School information loaded successfully.");

} catch (error) {
    console.error(error);
    showMessage(
        error.message || "Unable to load school information.",
        true
    );
}

}

function handleLogoSelection(event) {
const file = event.target.files[0];

if (!file) {
    selectedLogo = null;
    setPreview(currentLogoUrl);
    return;
}

const allowedTypes = [
    "image/png",
    "image/jpeg",
    "image/webp"
];

if (!allowedTypes.includes(file.type)) {
    showMessage("Select a PNG, JPG, JPEG or WebP image.", true);
    event.target.value = "";
    selectedLogo = null;
    setPreview(currentLogoUrl);
    return;
}

if (file.size > 3 * 1024 * 1024) {
    showMessage("Logo must not exceed 3 MB.", true);
    event.target.value = "";
    selectedLogo = null;
    setPreview(currentLogoUrl);
    return;
}

selectedLogo = file;

const reader = new FileReader();

reader.onload = function (e) {
    setPreview(e.target.result);
    showMessage("Logo preview loaded successfully. Save Settings to upload.");
};

reader.onerror = function () {
    showMessage("Unable to preview this image.", true);
};

reader.readAsDataURL(file);

}

async function uploadSchoolLogo(file) {
const extension = file.name.split(".").pop().toLowerCase();

const filePath =
    `${currentSchoolId}/logo-${Date.now()}.${extension}`;

const { error } = await db.storage
    .from("school-logos")
    .upload(filePath, file, {
        contentType: file.type,
        upsert: false
    });

if (error) throw error;

const { data } = db.storage
    .from("school-logos")
    .getPublicUrl(filePath);

if (!data || !data.publicUrl) {
    throw new Error("Could not generate the logo URL.");
}

return data.publicUrl;

}

async function saveSchoolSettings(event) {
event.preventDefault();

if (!currentSchoolId) {
    showMessage("School information is not loaded. Refresh the page.", true);
    return;
}

const saveButton = $("saveBtn");

saveButton.disabled = true;
saveButton.textContent = "Saving...";

try {
    let logoUrl = currentLogoUrl;

    if (selectedLogo) {
        showMessage("Uploading school logo...");
        logoUrl = await uploadSchoolLogo(selectedLogo);
    }

    const updates = {
        head_teacher_name: $("headTeacherName").value.trim(),
        address: $("schoolAddress").value.trim(),
        phone: $("schoolPhone").value.trim(),
        school_email: $("schoolEmail").value.trim()
    };

    if (selectedLogo) {
        updates.logo_url = logoUrl;
    }

    const { error } = await db
        .from("schools")
        .update(updates)
        .eq("id", currentSchoolId);

    if (error) throw error;

    currentLogoUrl = logoUrl;
    selectedLogo = null;
    $("logoFile").value = "";

    setPreview(currentLogoUrl);
    showMessage("School settings saved successfully.");

} catch (error) {
    console.error(error);
    showMessage(
        error.message || "Unable to save school settings.",
        true
    );

} finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save School Settings";
}

}

document.addEventListener("DOMContentLoaded", function () {
$("logoFile").addEventListener("change", handleLogoSelection);
$("saveBtn").addEventListener("click", saveSchoolSettings);

initializeSettings();

});
