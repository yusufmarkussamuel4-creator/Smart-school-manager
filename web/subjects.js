let db;
let currentUserId = null;
let currentSchoolId = null;

let subjects = [];
let classes = [];
let assignments = [];
let editingSubjectId = null;

document.addEventListener("DOMContentLoaded", initializeSubjects);

async function initializeSubjects() {
    try {
        showMessage("Connecting to school database...", "info");

        if (!window.SUPABASE_CONFIG) {
            throw new Error("Supabase configuration was not found.");
        }

        db = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.KEY
        );

        document.getElementById("subjectForm")
            .addEventListener("submit", saveSubject);

        document.getElementById("cancelEditBtn")
            .addEventListener("click", resetForm);

        document.getElementById("assignSubjectBtn")
            .addEventListener("click", assignSubject);

        document.getElementById("subjectSearch")
            .addEventListener("input", displaySubjects);

        await verifyUser();
        await loadAllData();

        showMessage("Subject management is ready.", "success");

    } catch (error) {
        console.error("Subject initialization error:", error);
        showMessage(error.message, "error");
    }
}


// VERIFY USER AND SCHOOL

async function verifyUser() {
    const { data: userData, error: userError } =
        await db.auth.getUser();

    if (userError) throw userError;

    if (!userData.user) {
        throw new Error("Please log in before accessing Subject Management.");
    }

    currentUserId = userData.user.id;

    const { data: membership, error: membershipError } =
        await db
            .from("school_memberships")
            .select("school_id")
            .eq("user_id", currentUserId)
            .eq("role", "school_admin")
            .limit(1)
            .maybeSingle();

    if (membershipError) throw membershipError;

    if (!membership) {
        throw new Error("No school administrator membership was found.");
    }

    currentSchoolId = membership.school_id;
}


// LOAD ALL DATA

async function loadAllData() {
    await Promise.all([
        loadSubjects(),
        loadClasses(),
        loadAssignments()
    ]);

    displaySubjects();
    displayAssignments();
    updateStatistics();
    populateAssignmentSelectors();
}


// LOAD SUBJECTS

async function loadSubjects() {
    const { data, error } = await db
        .from("subjects")
        .select("*")
        .eq("school_id", currentSchoolId)
        .order("subject_name");

    if (error) throw error;

    subjects = data || [];
}


// LOAD CLASSES

async function loadClasses() {
    const { data, error } = await db
        .from("classes")
        .select("*")
        .eq("school_id", currentSchoolId)
        .order("class_name");

    if (error) throw error;

    classes = data || [];
}


// LOAD CLASS SUBJECT ASSIGNMENTS

async function loadAssignments() {
    const { data, error } = await db
        .from("class_subjects")
        .select("*")
        .eq("school_id", currentSchoolId);

    if (error) throw error;

    assignments = data || [];
}


// DISPLAY SUBJECTS

function displaySubjects() {
    const tbody = document.getElementById("subjectList");
    const search = document.getElementById("subjectSearch")
        .value.trim().toLowerCase();

    tbody.innerHTML = "";

    const filtered = subjects.filter(subject =>
        (subject.subject_name || "").toLowerCase().includes(search) ||
        (subject.subject_code || "").toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">No subjects found.</td>
            </tr>
        `;
        return;
    }

    filtered.forEach((subject, index) => {
        const count = assignments.filter(
            item => item.subject_id === subject.id
        ).length;

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${escapeHTML(subject.subject_name)}</td>
            <td>${escapeHTML(subject.subject_code || "-")}</td>
            <td>${count}</td>
            <td>
                <button class="primary-btn"
                    onclick="editSubject('${subject.id}')">
                    Edit
                </button>

                <button class="danger-btn"
                    onclick="deleteSubject('${subject.id}')">
                    Delete
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });
}


// SAVE OR UPDATE SUBJECT

async function saveSubject(event) {
    event.preventDefault();

    const name = document.getElementById("subjectName")
        .value.trim();

    const code = document.getElementById("subjectCode")
        .value.trim();

    const button = document.getElementById("saveSubjectBtn");

    if (!name) {
        showMessage("Enter a subject name.", "error");
        return;
    }

    const duplicate = subjects.find(subject =>
        subject.subject_name.toLowerCase() === name.toLowerCase() &&
        subject.id !== editingSubjectId
    );

    if (duplicate) {
        showMessage("This subject already exists.", "error");
        return;
    }

    const subjectData = {
        school_id: currentSchoolId,
        subject_name: name,
        subject_code: code || null
    };

    button.disabled = true;

    try {
        if (editingSubjectId) {
            const { error } = await db
                .from("subjects")
                .update(subjectData)
                .eq("id", editingSubjectId)
                .eq("school_id", currentSchoolId);

            if (error) throw error;

            showMessage("Subject updated successfully.", "success");

        } else {
            const { error } = await db
                .from("subjects")
                .insert([subjectData]);

            if (error) throw error;

            showMessage("Subject registered successfully.", "success");
        }

        resetForm();
        await loadAllData();

    } catch (error) {
        console.error(error);
        showMessage(error.message, "error");

    } finally {
        button.disabled = false;
    }
}


// EDIT SUBJECT

function editSubject(id) {
    const subject = subjects.find(item => item.id === id);

    if (!subject) return;

    editingSubjectId = id;

    document.getElementById("subjectName").value =
        subject.subject_name;

    document.getElementById("subjectCode").value =
        subject.subject_code || "";

    document.getElementById("formTitle").textContent =
        "Edit Subject";

    document.getElementById("saveSubjectBtn").textContent =
        "Update Subject";

    document.getElementById("cancelEditBtn").style.display =
        "inline-block";

    window.scrollTo({ top: 0, behavior: "smooth" });
}


// RESET FORM

function resetForm() {
    editingSubjectId = null;

    document.getElementById("subjectForm").reset();

    document.getElementById("formTitle").textContent =
        "Register New Subject";

    document.getElementById("saveSubjectBtn").textContent =
        "Register Subject";

    document.getElementById("cancelEditBtn").style.display =
        "none";
}


// DELETE SUBJECT

async function deleteSubject(id) {
    const subject = subjects.find(item => item.id === id);

    if (!subject) return;

    const count = assignments.filter(
        item => item.subject_id === id
    ).length;

    if (count > 0) {
        showMessage(
            "This subject is assigned to classes. Remove its assignments before deleting it.",
            "error"
        );
        return;
    }

    if (!confirm(
        `Are you sure you want to delete ${subject.subject_name}?`
    )) return;

    try {
        const { error } = await db
            .from("subjects")
            .delete()
            .eq("id", id)
            .eq("school_id", currentSchoolId);

        if (error) throw error;

        showMessage("Subject deleted successfully.", "success");

        await loadAllData();

    } catch (error) {
        console.error(error);
        showMessage(error.message, "error");
    }
}


// POPULATE ASSIGNMENT SELECTORS

function populateAssignmentSelectors() {
    const classSelect = document.getElementById("assignmentClass");
    const subjectSelect = document.getElementById("assignmentSubject");

    classSelect.innerHTML = '<option value="">Select class</option>';

    subjectSelect.innerHTML = '<option value="">Select subject</option>';

    classes.forEach(item => {
        const option = document.createElement("option");

        option.value = item.id;
        option.textContent =
            item.class_name + (item.arm ? " - " + item.arm : "");

        classSelect.appendChild(option);
    });

    subjects.forEach(item => {
        const option = document.createElement("option");

        option.value = item.id;
        option.textContent = item.subject_name;

        subjectSelect.appendChild(option);
    });
}


// ASSIGN SUBJECT TO CLASS

async function assignSubject() {
    const classId = document.getElementById("assignmentClass").value;
    const subjectId = document.getElementById("assignmentSubject").value;

    if (!classId || !subjectId) {
        showMessage("Select both a class and a subject.", "error");
        return;
    }

    const duplicate = assignments.find(item =>
        item.class_id === classId &&
        item.subject_id === subjectId
    );

    if (duplicate) {
        showMessage("This subject is already assigned to this class.", "error");
        return;
    }

    const button = document.getElementById("assignSubjectBtn");

    button.disabled = true;

    try {
        const { error } = await db
            .from("class_subjects")
            .insert([{
                school_id: currentSchoolId,
                class_id: classId,
                subject_id: subjectId
            }]);

        if (error) throw error;

        showMessage("Subject assigned successfully.", "success");

        await loadAllData();

    } catch (error) {
        console.error(error);
        showMessage(error.message, "error");

    } finally {
        button.disabled = false;
    }
}


// DISPLAY ASSIGNMENTS

function displayAssignments() {
    const tbody = document.getElementById("assignmentList");

    tbody.innerHTML = "";

    if (assignments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4">No class assignments yet.</td>
            </tr>
        `;
        return;
    }

    assignments.forEach((assignment, index) => {
        const classItem = classes.find(
            item => item.id === assignment.class_id
        );

        const subjectItem = subjects.find(
            item => item.id === assignment.subject_id
        );

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${escapeHTML(
                classItem
                    ? classItem.class_name +
                      (classItem.arm ? " - " + classItem.arm : "")
                    : "Unknown class"
            )}</td>
            <td>${escapeHTML(
                subjectItem ? subjectItem.subject_name : "Unknown subject"
            )}</td>
            <td>
                <button class="danger-btn"
                    onclick="removeAssignment('${assignment.id}')">
                    Remove
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });
}


// REMOVE SUBJECT ASSIGNMENT

async function removeAssignment(id) {
    if (!confirm("Remove this subject from the selected class?")) {
        return;
    }

    try {
        const { error } = await db
            .from("class_subjects")
            .delete()
            .eq("id", id)
            .eq("school_id", currentSchoolId);

        if (error) throw error;

        showMessage("Subject assignment removed.", "success");

        await loadAllData();

    } catch (error) {
        console.error(error);
        showMessage(error.message, "error");
    }
}


// UPDATE STATISTICS

function updateStatistics() {
    document.getElementById("totalSubjects").textContent =
        subjects.length;

    document.getElementById("totalAssignments").textContent =
        assignments.length;
}


// MESSAGE DISPLAY

function showMessage(message, type) {
    const box = document.getElementById("subjectMessage");

    box.textContent = message;
    box.style.display = "block";

    if (type === "success") {
        box.style.background = "#d4edda";
        box.style.color = "#155724";
    } else if (type === "error") {
        box.style.background = "#f8d7da";
        box.style.color = "#721c24";
    } else {
        box.style.background = "#d1ecf1";
        box.style.color = "#0c5460";
    }
}


// SAFE HTML DISPLAY

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}
