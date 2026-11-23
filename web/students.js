const db = supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

const PASSPORT_BUCKET = "student-passports";

let currentUser = null;
let currentSchoolId = null;
let students = [];
let classes = [];
let showingArchived = false;
let currentProfile = null;

const $ = id => document.getElementById(id);

function message(id, text, error = false) {
    const el = $(id);
    if (!el) return;

    el.textContent = text;
    el.style.color = error ? "red" : "green";
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function validatePhoto(file) {
    if (!file) return true;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        alert("Use JPG, PNG or WEBP photographs only.");
        return false;
    }

    if (file.size > 3 * 1024 * 1024) {
        alert("Passport photograph must not exceed 3MB.");
        return false;
    }

    return true;
}

function previewPhoto(inputId, previewId) {
    const input = $(inputId);
    const preview = $(previewId);

    if (!input || !preview || !input.files[0]) return;

    if (!validatePhoto(input.files[0])) {
        input.value = "";
        preview.src = "";
        return;
    }

    preview.src = URL.createObjectURL(input.files[0]);
    preview.style.display = "block";
}

async function uploadPassport(file, studentId) {
    if (!file) return null;

    if (!validatePhoto(file)) {
        throw new Error("Invalid photograph.");
    }

    const extension = file.name.split(".").pop().toLowerCase();
    const path = `${currentSchoolId}/${studentId}.${extension}`;

    const { error } = await db.storage
        .from(PASSPORT_BUCKET)
        .upload(path, file, {
            upsert: true,
            contentType: file.type
        });

    if (error) throw error;

    return path;
}

async function getPassportUrl(path) {
    if (!path) return null;

    const cleanPath = path.replace(/^\/+/, "");

    const { data, error } = await db.storage
        .from(PASSPORT_BUCKET)
        .createSignedUrl(cleanPath, 3600);

    if (error) {
        console.error("Passport URL error:", error);
        throw error;
    }

    return data.signedUrl;
}

async function displayPassport(imageId, path) {
    const image = $(imageId);
    if (!image) return;

    image.onerror = null;
    image.onload = null;
    image.removeAttribute("src");

    if (!path) {
        image.style.display = "none";
        return;
    }

    try {
        const url = await getPassportUrl(path);

        if (!url) {
            image.style.display = "none";
            return;
        }

        image.onload = () => {
            image.style.display = "block";
        };

        image.onerror = () => {
            console.error("Passport image failed to load:", path);
            image.style.display = "none";
        };

        image.src = url;
        image.style.display = "block";

    } catch (error) {
        console.error("Unable to display passport:", error);
        image.style.display = "none";
    }
}

async function initializeStudents() {
    try {
        const { data: auth, error: authError } =
            await db.auth.getUser();

        if (authError || !auth.user) {
            alert("Please log in first.");
            return;
        }

        currentUser = auth.user;

        const { data: membership, error } = await db
            .from("school_memberships")
            .select("school_id, role")
            .eq("user_id", currentUser.id)
            .eq("role", "school_admin")
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        if (!membership) {
            alert("School administrator access not found.");
            return;
        }

        currentSchoolId = membership.school_id;

        await loadClasses();
        createArchiveControls();
        await loadStudents();

        if ($("studentForm")) {
            $("studentForm").addEventListener(
                "submit",
                registerStudent
            );
        }

        if ($("studentSearch")) {
            $("studentSearch").addEventListener(
                "input",
                displayStudents
            );
        }

        if ($("passportPhoto")) {
            $("passportPhoto").addEventListener("change", () =>
                previewPhoto("passportPhoto", "passportPreview")
            );
        }

        if ($("profilePassportPhoto")) {
            $("profilePassportPhoto").addEventListener("change", () =>
                previewPhoto(
                    "profilePassportPhoto",
                    "profilePassportPreview"
                )
            );
        }

        if ($("profileForm")) {
            $("profileForm").addEventListener(
                "submit",
                saveProfile
            );
        }

    } catch (error) {
        console.error(error);
        alert("Unable to initialize Student Management: " + error.message);
    }
}

async function loadClasses() {
    const { data, error } = await db
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", currentSchoolId)
        .order("class_name");

    if (error) throw error;

    classes = data || [];

    const select = $("classId");

    if (select) {
        select.innerHTML = '<option value="">Select Class</option>';

        classes.forEach(item => {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent =
                item.class_name + (item.arm ? " " + item.arm : "");
            select.appendChild(option);
        });
    }
}

async function registerStudent(event) {
    event.preventDefault();

    try {
        const file = $("passportPhoto")?.files[0];

        if (file && !validatePhoto(file)) return;

        const classId = $("classId").value;

        if (!classId) {
            throw new Error("Please select a class.");
        }

        const studentData = {
            school_id: currentSchoolId,
            admission_number: $("admissionNumber").value.trim(),
            first_name: $("firstName").value.trim(),
            middle_name: $("middleName").value.trim() || null,
            last_name: $("lastName").value.trim(),
            gender: $("gender").value || null,
            date_of_birth: $("dateOfBirth").value || null,
            guardian_name: $("guardianName").value.trim() || null,
            guardian_phone: $("guardianPhone").value.trim() || null,
            home_address: $("homeAddress").value.trim() || null,
            archived_at: null
        };

        if (!studentData.admission_number ||
            !studentData.first_name ||
            !studentData.last_name) {
            throw new Error("Complete all required student details.");
        }

        const { data: student, error } = await db
            .from("students")
            .insert(studentData)
            .select()
            .single();

        if (error) throw error;

        if (file) {
            const passportPath = await uploadPassport(file, student.id);

            const { error: photoError } = await db
                .from("students")
                .update({ passport_url: passportPath })
                .eq("id", student.id)
                .eq("school_id", currentSchoolId);

            if (photoError) throw photoError;
        }

        const { error: enrollmentError } = await db
            .from("student_enrollments")
            .insert({
                school_id: currentSchoolId,
                student_id: student.id,
                class_id: classId,
                academic_session: $("academicSession").value.trim(),
                term: $("term").value
            });

        if (enrollmentError) throw enrollmentError;

        $("studentForm").reset();

        if ($("passportPreview")) {
            $("passportPreview").src = "";
            $("passportPreview").style.display = "none";
        }

        message("studentMessage", "Student registered successfully.");

        await loadStudents();

    } catch (error) {
        console.error(error);
        message("studentMessage", error.message, true);
    }
}

async function loadStudents() {
    const { data, error } = await db
        .from("students")
        .select("*")
        .eq("school_id", currentSchoolId)
        .order("created_at", { ascending: false });

    if (error) throw error;

    students = data || [];

    const { data: enrollments, error: enrollmentError } = await db
        .from("student_enrollments")
        .select("id, student_id, class_id, academic_session, term")
        .eq("school_id", currentSchoolId);

    if (enrollmentError) throw enrollmentError;

    students = students.map(student => {
        const enrollment = (enrollments || []).find(
            item => item.student_id === student.id
        );

        const classItem = enrollment
            ? classes.find(item => item.id === enrollment.class_id)
            : null;

        return {
            ...student,
            enrollment_id: enrollment?.id || null,
            class_name: classItem?.class_name || "Not assigned",
            arm: classItem?.arm || "",
            academic_session: enrollment?.academic_session || "",
            term: enrollment?.term || ""
        };
    });

    displayStudents();
}

function createArchiveControls() {
    const list = $("studentList");
    if (!list) return;

    const container = list.parentElement;
    if (!container || $("archiveToggle")) return;

    const button = document.createElement("button");
    button.id = "archiveToggle";
    button.type = "button";
    button.textContent = "View Archived Students";

    button.style.margin = "10px 0";
    button.style.padding = "10px";
    button.style.cursor = "pointer";

    button.onclick = () => {
        showingArchived = !showingArchived;

        button.textContent = showingArchived
            ? "View Active Students"
            : "View Archived Students";

        displayStudents();
    };

    container.insertBefore(button, list);
}

function displayStudents() {
    const list = $("studentList");
    if (!list) return;

    const search = ($("studentSearch")?.value || "").toLowerCase();

    const filtered = students.filter(student => {
        const archived = !!student.archived_at;

        if (archived !== showingArchived) return false;

        const name = [
            student.first_name,
            student.middle_name,
            student.last_name
        ].filter(Boolean).join(" ").toLowerCase();

        return (
            name.includes(search) ||
            String(student.admission_number || "").toLowerCase().includes(search) ||
            String(student.class_name || "").toLowerCase().includes(search)
        );
    });

    if (!filtered.length) {
        list.innerHTML = `
            <tr>
                <td colspan="4">
                    No ${showingArchived ? "archived" : "active"} students found.
                </td>
            </tr>`;
        return;
    }

    list.innerHTML = filtered.map(student => `
        <tr>
            <td>${escapeHTML(student.admission_number)}</td>
            <td>${escapeHTML([
                student.first_name,
                student.middle_name,
                student.last_name
            ].filter(Boolean).join(" "))}</td>
            <td>${escapeHTML(student.class_name)}</td>
            <td>
                <button onclick="openProfile('${student.id}')">
                    View Profile
                </button>

                ${
                    showingArchived
                    ? `<button onclick="restoreStudent('${student.id}')">
                        Restore
                       </button>`
                    : `<button onclick="openProfile('${student.id}')">
                        Edit
                       </button>
                       <button onclick="archiveStudent('${student.id}')">
                        Archive
                       </button>`
                }
            </td>
        </tr>
    `).join("");
}

async function archiveStudent(studentId) {
    const student = students.find(item => item.id === studentId);
    if (!student) return;

    const confirmed = confirm(
        `Archive ${student.first_name} ${student.last_name}?\n\n` +
        "The student will disappear from the active list, " +
        "but their records will be preserved."
    );

    if (!confirmed) return;

    const { error } = await db
        .from("students")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", studentId)
        .eq("school_id", currentSchoolId);

    if (error) {
        alert("Unable to archive student: " + error.message);
        return;
    }

    alert("Student archived successfully.");
    await loadStudents();
}

async function restoreStudent(studentId) {
    const confirmed = confirm(
        "Restore this student to the active student list?"
    );

    if (!confirmed) return;

    const { error } = await db
        .from("students")
        .update({ archived_at: null })
        .eq("id", studentId)
        .eq("school_id", currentSchoolId);

    if (error) {
        alert("Unable to restore student: " + error.message);
        return;
    }

    alert("Student restored successfully.");
    await loadStudents();
}

async function openProfile(studentId) {
    try {
        const student = students.find(item => item.id === studentId);
        if (!student) return;

        currentProfile = student;

        const fields = {
            profileStudentId: student.id,
            profileEnrollmentId: student.enrollment_id || "",
            profileAdmission: student.admission_number,
            profileFirstName: student.first_name,
            profileMiddleName: student.middle_name || "",
            profileLastName: student.last_name,
            profileGender: student.gender || "",
            profileDOB: student.date_of_birth || "",
            profileGuardian: student.guardian_name || "",
            profilePhone: student.guardian_phone || "",
            profileClass: student.class_name || "",
            profileSession: student.academic_session || "",
            profileTerm: student.term || "",
            profileAddress: student.home_address || ""
        };

        Object.entries(fields).forEach(([id, value]) => {
            if ($(id)) $(id).value = value;
        });

        await displayPassport(
            "profilePassportPreview",
            student.passport_url
        );

        if ($("profileTitle")) {
            $("profileTitle").textContent = "Student Profile";
        }

        if ($("profileMessage")) {
            $("profileMessage").textContent = "";
        }

        setProfileMode(false);

        if ($("profileModal")) {
            $("profileModal").style.display = "block";
        }

    } catch (error) {
        console.error(error);
        alert("Unable to open student profile: " + error.message);
    }
}

function setProfileMode(editing) {
    const form = $("profileForm");
    if (!form) return;

    form.querySelectorAll("input, select, textarea").forEach(field => {
        if (field.id === "profileStudentId" ||
            field.id === "profileEnrollmentId") return;

        field.disabled = !editing;
    });

    if ($("editProfileButton")) {
        $("editProfileButton").style.display =
            editing ? "none" : "inline-block";
    }

    if ($("saveProfileButton")) {
        $("saveProfileButton").style.display =
            editing ? "inline-block" : "none";
    }

    if ($("cancelEditButton")) {
        $("cancelEditButton").style.display =
            editing ? "inline-block" : "none";
    }
}

async function saveProfile(event) {
    event.preventDefault();

    if (!currentProfile) return;

    try {
        const studentId = currentProfile.id;
        const file = $("profilePassportPhoto")?.files[0];

        if (file && !validatePhoto(file)) return;

        const updated = {
            admission_number: $("profileAdmission").value.trim(),
            first_name: $("profileFirstName").value.trim(),
            middle_name: $("profileMiddleName").value.trim() || null,
            last_name: $("profileLastName").value.trim(),
            gender: $("profileGender").value || null,
            date_of_birth: $("profileDOB").value || null,
            guardian_name: $("profileGuardian").value.trim() || null,
            guardian_phone: $("profilePhone").value.trim() || null,
            home_address: $("profileAddress").value.trim() || null
        };

        const { error } = await db
            .from("students")
            .update(updated)
            .eq("id", studentId)
            .eq("school_id", currentSchoolId);

        if (error) throw error;

        if (file) {
            const path = await uploadPassport(file, studentId);

            const { error: photoError } = await db
                .from("students")
                .update({ passport_url: path })
                .eq("id", studentId)
                .eq("school_id", currentSchoolId);

            if (photoError) throw photoError;
        }

        const classItem = classes.find(
            item => item.class_name === $("profileClass").value
        );

        if (classItem && currentProfile.enrollment_id) {
            const { error: enrollmentError } = await db
                .from("student_enrollments")
                .update({
                    class_id: classItem.id,
                    academic_session: $("profileSession").value,
                    term: $("profileTerm").value
                })
                .eq("id", currentProfile.enrollment_id)
                .eq("school_id", currentSchoolId);

            if (enrollmentError) throw enrollmentError;
        }

        alert("Student profile updated successfully.");

        if ($("profilePassportPhoto")) {
            $("profilePassportPhoto").value = "";
        }

        await loadStudents();
        closeProfile();

    } catch (error) {
        console.error(error);
        message("profileMessage", error.message, true);
    }
}

function closeProfile() {
    if ($("profileModal")) {
        $("profileModal").style.display = "none";
    }

    currentProfile = null;
}

function logoutStudentManagement() {
    db.auth.signOut().then(() => {
        window.location.href = "index.html";
    });
}

if ($("editProfileButton")) {
    $("editProfileButton").addEventListener(
        "click",
        () => setProfileMode(true)
    );
}

if ($("cancelEditButton")) {
    $("cancelEditButton").addEventListener(
        "click",
        () => {
            if (currentProfile) {
                openProfile(currentProfile.id);
            } else {
                closeProfile();
            }
        }
    );
}

initializeStudents();
