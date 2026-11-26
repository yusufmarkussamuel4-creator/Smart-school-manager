const db = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

const $ = id => document.getElementById(id);

let currentUser = null;
let currentSchoolId = null;
let currentLogoUrl = null;
let selectedLogo = null;

const DEFAULT_GRADING_SCALE = [
    { min: 80, max: 100, grade: "A", remark: "Excellent" },
    { min: 70, max: 79, grade: "B", remark: "Very Good" },
    { min: 60, max: 69, grade: "C", remark: "Good" },
    { min: 50, max: 59, grade: "D", remark: "Credit" },
    { min: 45, max: 49, grade: "E", remark: "Pass" },
    { min: 0, max: 44, grade: "F", remark: "Fail" }
];

let gradingScale = [];

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

// ==========================================
// GRADING SCALE FUNCTIONS
// ==========================================

function renderGradingScale() {
    const tbody = $("gradingTableBody");

    if (!tbody) return;

    tbody.replaceChildren();

    gradingScale.forEach((item, index) => {

        const row = document.createElement("tr");

        const minCell = document.createElement("td");
        const maxCell = document.createElement("td");
        const gradeCell = document.createElement("td");
        const remarkCell = document.createElement("td");
        const actionCell = document.createElement("td");

        const minInput = document.createElement("input");
        minInput.type = "number";
        minInput.min = "0";
        minInput.max = "100";
        minInput.value = item.min;
        minInput.className = "grade-min";
        minInput.setAttribute("aria-label", "Minimum score");

        const maxInput = document.createElement("input");
        maxInput.type = "number";
        maxInput.min = "0";
        maxInput.max = "100";
        maxInput.value = item.max;
        maxInput.className = "grade-max";
        maxInput.setAttribute("aria-label", "Maximum score");

        const gradeInput = document.createElement("input");
        gradeInput.type = "text";
        gradeInput.value = item.grade;
        gradeInput.maxLength = 5;
        gradeInput.className = "grade-letter";
        gradeInput.setAttribute("aria-label", "Grade");

        const remarkInput = document.createElement("input");
        remarkInput.type = "text";
        remarkInput.value = item.remark;
        remarkInput.maxLength = 50;
        remarkInput.className = "remark-input";
        remarkInput.setAttribute("aria-label", "Grade remark");

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-grade-btn";
        removeButton.textContent = "Remove";

        minInput.addEventListener("input", () => {
            gradingScale[index].min = minInput.value;
        });

        maxInput.addEventListener("input", () => {
            gradingScale[index].max = maxInput.value;
        });

        gradeInput.addEventListener("input", () => {
            gradingScale[index].grade = gradeInput.value;
        });

        remarkInput.addEventListener("input", () => {
            gradingScale[index].remark = remarkInput.value;
        });

        removeButton.addEventListener("click", () => {

            if (gradingScale.length <= 1) {
                showMessage(
                    "At least one grade category is required.",
                    true
                );
                return;
            }

            gradingScale.splice(index, 1);

            renderGradingScale();

            showMessage(
                "Grade category removed. Save your changes to apply them."
            );
        });

        minCell.appendChild(minInput);
        maxCell.appendChild(maxInput);
        gradeCell.appendChild(gradeInput);
        remarkCell.appendChild(remarkInput);
        actionCell.appendChild(removeButton);

        row.append(
            minCell,
            maxCell,
            gradeCell,
            remarkCell,
            actionCell
        );

        tbody.appendChild(row);
    });
}

function addGradeCategory() {

    gradingScale.push({
        min: "",
        max: "",
        grade: "",
        remark: ""
    });

    renderGradingScale();

    showMessage(
        "New grade category added. Enter its details and save."
    );
}

function validateGradingScale() {

    if (!Array.isArray(gradingScale) || gradingScale.length === 0) {
        throw new Error("Your grading scale cannot be empty.");
    }

    const cleanedScale = gradingScale.map(item => {

        const min = Number(item.min);
        const max = Number(item.max);

        const grade = String(item.grade || "").trim();
        const remark = String(item.remark || "").trim();

        if (
            item.min === "" ||
            item.max === "" ||
            !Number.isInteger(min) ||
            !Number.isInteger(max)
        ) {
            throw new Error(
                "Enter valid whole-number minimum and maximum scores."
            );
        }

        if (min < 0 || max > 100 || min > max) {
            throw new Error(
                "Scores must be between 0 and 100, and minimum cannot exceed maximum."
            );
        }

        if (!grade || !remark) {
            throw new Error(
                "Every grading category must have a grade and remark."
            );
        }

        return {
            min,
            max,
            grade,
            remark
        };
    });

    cleanedScale.sort((a, b) => a.min - b.min);

    if (cleanedScale[0].min !== 0) {
        throw new Error(
            "Your grading scale must begin at 0."
        );
    }

    if (
        cleanedScale[cleanedScale.length - 1].max !== 100
    ) {
        throw new Error(
            "Your grading scale must end at 100."
        );
    }

    for (let i = 0; i < cleanedScale.length - 1; i++) {

        if (
            cleanedScale[i].max + 1 !== cleanedScale[i + 1].min
        ) {
            throw new Error(
                "Your grading ranges must be continuous without gaps or overlaps."
            );
        }
    }

    return cleanedScale;
}

// ==========================================
// LOAD SCHOOL INFORMATION
// ==========================================

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
            throw new Error(
                "No school administrator account was found."
            );
        }

        currentSchoolId = membership.school_id;

        const { data: school, error: schoolError } =
            await db
                .from("schools")
                .select(`
                    school_name,
                    school_motto,
                    head_teacher_name,
                    school_email,
                    phone,
                    address,
                    logo_url,
                    grading_scale
                `)
                .eq("id", currentSchoolId)
                .single();

        if (schoolError) throw schoolError;

        $("schoolName").value = school.school_name || "";

        $("schoolMotto").value =
            school.school_motto || "";

        $("headTeacherName").value =
            school.head_teacher_name || "";

        $("schoolAddress").value =
            school.address || "";

        $("schoolPhone").value =
            school.phone || "";

        $("schoolEmail").value =
            school.school_email || "";

        currentLogoUrl = school.logo_url || null;

        setPreview(currentLogoUrl);

        gradingScale = Array.isArray(school.grading_scale)
            ? school.grading_scale
            : JSON.parse(JSON.stringify(DEFAULT_GRADING_SCALE));

        renderGradingScale();

        showMessage(
            "School information and grading scale loaded successfully."
        );

    } catch (error) {

        console.error("Settings loading error:", error);

        showMessage(
            error.message || "Unable to load school information.",
            true
        );
    }
}

// ==========================================
// LOGO SELECTION
// ==========================================

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

        showMessage(
            "Select a PNG, JPG, JPEG or WebP image.",
            true
        );

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

        showMessage(
            "Logo preview loaded successfully. Save Settings to upload."
        );
    };

    reader.onerror = function () {

        showMessage(
            "Unable to preview this image.",
            true
        );
    };

    reader.readAsDataURL(file);
}

// ==========================================
// UPLOAD SCHOOL LOGO
// ==========================================

async function uploadSchoolLogo(file) {

    const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

    const filePath =
        `${currentSchoolId}/logo-${Date.now()}.${extension}`;

    const { error: uploadError } = await db.storage
        .from("school-logos")
        .upload(filePath, file, {
            contentType: file.type,
            upsert: false
        });

    if (uploadError) throw uploadError;

    const { data } = db.storage
        .from("school-logos")
        .getPublicUrl(filePath);

    if (!data || !data.publicUrl) {
        throw new Error("Could not generate the logo URL.");
    }

    return data.publicUrl;
}

// ==========================================
// SAVE SCHOOL SETTINGS
// ==========================================

async function saveSchoolSettings(event) {

    if (event) event.preventDefault();

    if (!currentSchoolId) {

        showMessage(
            "School information is not loaded. Refresh the page.",
            true
        );

        return;
    }

    const saveButton = $("saveBtn");

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {

        showMessage("Validating grading scale...");

        const validatedGradingScale =
            validateGradingScale();

        let logoUrl = currentLogoUrl;

        if (selectedLogo) {

            showMessage("Uploading school logo...");

            logoUrl = await uploadSchoolLogo(selectedLogo);
        }

        const updates = {

            school_motto:
                $("schoolMotto").value.trim(),

            head_teacher_name:
                $("headTeacherName").value.trim(),

            address:
                $("schoolAddress").value.trim(),

            phone:
                $("schoolPhone").value.trim(),

            school_email:
                $("schoolEmail").value.trim(),

            grading_scale:
                validatedGradingScale
        };

        if (selectedLogo) {
            updates.logo_url = logoUrl;
        }

        showMessage("Saving school settings...");

        const { error: updateError } = await db
            .from("schools")
            .update(updates)
            .eq("id", currentSchoolId);

        if (updateError) throw updateError;

        currentLogoUrl = logoUrl;

        selectedLogo = null;

        gradingScale = validatedGradingScale;

        $("logoFile").value = "";

        setPreview(currentLogoUrl);

        renderGradingScale();

        showMessage(
            "School settings and grading scale saved successfully."
        );

    } catch (error) {

        console.error("Save settings error:", error);

        showMessage(
            error.message || "Unable to save school settings.",
            true
        );

    } finally {

        saveButton.disabled = false;

        saveButton.textContent =
            "Save School Settings";
    }
}

// ==========================================
// PAGE INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", function () {

    $("logoFile").addEventListener(
        "change",
        handleLogoSelection
    );

    $("saveBtn").addEventListener(
        "click",
        saveSchoolSettings
    );

    $("addGradeBtn").addEventListener(
        "click",
        addGradeCategory
    );

    initializeSettings();

});
