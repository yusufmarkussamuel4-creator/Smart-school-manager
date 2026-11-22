const db = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

let currentSchoolId = null;
let teachers = [];
let showingArchived = false;

document.addEventListener("DOMContentLoaded", initializeTeachers);

async function initializeTeachers() {
    document.getElementById("teacherForm")
        .addEventListener("submit", saveTeacher);

    document.getElementById("cancelEditButton")
        .addEventListener("click", resetForm);

    document.getElementById("teacherSearch")
        .addEventListener("input", displayTeachers);

    document.getElementById("showArchivedButton")
        .addEventListener("click", toggleArchived);

    document.getElementById("teacherList")
        .addEventListener("click", handleTeacherAction);

    await verifyUser();
}

async function verifyUser() {
    showMessage("Checking login...", false);

    const { data: authData, error: authError } =
        await db.auth.getUser();

    if (authError || !authData.user) {
        showMessage("Please log in first.", true);
        return;
    }

    const { data: membership, error } = await db
        .from("school_memberships")
        .select("school_id")
        .eq("user_id", authData.user.id)
        .eq("role", "school_admin")
        .limit(1)
        .maybeSingle();

    if (error || !membership) {
        showMessage("School administrator membership not found.", true);
        return;
    }

    currentSchoolId = membership.school_id;

    await loadTeachers();

    showMessage("Teacher management is ready.", false);
}

async function loadTeachers() {
    const { data, error } = await db
        .from("teachers")
        .select("*")
        .eq("school_id", currentSchoolId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

    if (error) {
        showMessage("Unable to load teachers: " + error.message, true);
        return;
    }

    teachers = data || [];
    showingArchived = false;

    document.getElementById("showArchivedButton").textContent =
        "View Archived Teachers";

    displayTeachers();
}

async function loadArchivedTeachers() {
    const { data, error } = await db
        .from("teachers")
        .select("*")
        .eq("school_id", currentSchoolId)
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });

    if (error) {
        showMessage("Unable to load archived teachers: " + error.message, true);
        return;
    }

    teachers = data || [];
    displayTeachers();
}

function displayTeachers() {
    const list = document.getElementById("teacherList");
    const search = document.getElementById("teacherSearch")
        .value.toLowerCase().trim();

    list.innerHTML = "";

    const filtered = teachers.filter(teacher => {
        const name = [
            teacher.first_name,
            teacher.middle_name,
            teacher.last_name
        ].filter(Boolean).join(" ");

        return (
            name.toLowerCase().includes(search) ||
            teacher.staff_number.toLowerCase().includes(search) ||
            (teacher.phone || "").toLowerCase().includes(search) ||
            (teacher.qualification || "").toLowerCase().includes(search)
        );
    });

    if (filtered.length === 0) {
        list.innerHTML = `
            <tr>
                <td colspan="7">
                    ${showingArchived
                        ? "No archived teachers found."
                        : "No teachers registered yet."}
                </td>
            </tr>
        `;
    } else {
        filtered.forEach((teacher, index) => {
            const row = document.createElement("tr");

            const fullName = [
                teacher.first_name,
                teacher.middle_name,
                teacher.last_name
            ].filter(Boolean).join(" ");

            const actionButtons = showingArchived
                ? `<button class="teacher-button"
                       data-action="restore"
                       data-id="${teacher.id}">
                       Restore
                   </button>`
                : `
                    <button class="teacher-button"
                        data-action="edit"
                        data-id="${teacher.id}">
                        Edit
                    </button>
                    <button class="teacher-button archive-button"
                        data-action="archive"
                        data-id="${teacher.id}">
                        Archive
                    </button>
                `;

            const values = [
                index + 1,
                teacher.staff_number,
                fullName,
                teacher.gender || "-",
                teacher.phone || "-",
                teacher.qualification || "-"
            ];

            values.forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });

            const actionCell = document.createElement("td");
            actionCell.innerHTML = actionButtons;
            row.appendChild(actionCell);

            list.appendChild(row);
        });
    }

    document.getElementById("teacherSummary").textContent =
        (showingArchived ? "Archived Teachers: " : "Total Teachers: ") +
        filtered.length;
}

async function saveTeacher(event) {
    event.preventDefault();

    if (!currentSchoolId) {
        showMessage("School information is not available.", true);
        return;
    }

    const teacherId = document.getElementById("teacherId").value;

    const teacherData = {
        school_id: currentSchoolId,
        staff_number: document.getElementById("staffNumber").value.trim(),
        first_name: document.getElementById("firstName").value.trim(),
        middle_name: document.getElementById("middleName").value.trim() || null,
        last_name: document.getElementById("lastName").value.trim(),
        gender: document.getElementById("gender").value || null,
        phone: document.getElementById("phone").value.trim() || null,
        email: document.getElementById("email").value.trim() || null,
        qualification: document.getElementById("qualification").value.trim() || null,
        employment_date: document.getElementById("employmentDate").value || null,
        home_address: document.getElementById("homeAddress").value.trim() || null
    };

    if (
        !teacherData.staff_number ||
        !teacherData.first_name ||
        !teacherData.last_name
    ) {
        showMessage("Staff Number, First Name and Last Name are required.", true);
        return;
    }

    const saveButton = document.getElementById("saveTeacherButton");
    saveButton.disabled = true;
    showMessage("Saving teacher information...", false);

    let result;

    if (teacherId) {
        result = await db
            .from("teachers")
            .update(teacherData)
            .eq("id", teacherId)
            .eq("school_id", currentSchoolId);
    } else {
        result = await db
            .from("teachers")
            .insert([teacherData]);
    }

    saveButton.disabled = false;

    if (result.error) {
        showMessage("Unable to save teacher: " + result.error.message, true);
        return;
    }

    showMessage(
        teacherId
            ? "Teacher information updated successfully!"
            : "Teacher registered successfully!",
        false
    );

    resetForm();
    await loadTeachers();
}

async function handleTeacherAction(event) {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const teacherId = button.dataset.id;
    const action = button.dataset.action;

    const teacher = teachers.find(item => item.id === teacherId);

    if (!teacher) return;

    if (action === "edit") {
        editTeacher(teacher);
    }

    if (action === "archive") {
        await archiveTeacher(teacher);
    }

    if (action === "restore") {
        await restoreTeacher(teacher);
    }
}

function editTeacher(teacher) {
    document.getElementById("teacherId").value = teacher.id;
    document.getElementById("staffNumber").value = teacher.staff_number;
    document.getElementById("firstName").value = teacher.first_name;
    document.getElementById("middleName").value = teacher.middle_name || "";
    document.getElementById("lastName").value = teacher.last_name;
    document.getElementById("gender").value = teacher.gender || "";
    document.getElementById("phone").value = teacher.phone || "";
    document.getElementById("email").value = teacher.email || "";
    document.getElementById("qualification").value =
        teacher.qualification || "";
    document.getElementById("employmentDate").value =
        teacher.employment_date || "";
    document.getElementById("homeAddress").value =
        teacher.home_address || "";

    document.getElementById("saveTeacherButton").textContent =
        "Update Teacher";

    document.getElementById("cancelEditButton").hidden = false;

    showMessage("Editing " + teacher.first_name + "'s profile.", false);

    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function archiveTeacher(teacher) {
    const confirmed = confirm(
        "Archive " + teacher.first_name + " " +
        teacher.last_name + "?"
    );

    if (!confirmed) return;

    const { error } = await db
        .from("teachers")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", teacher.id)
        .eq("school_id", currentSchoolId);

    if (error) {
        showMessage("Unable to archive teacher: " + error.message, true);
        return;
    }

    showMessage("Teacher archived successfully.", false);
    await loadTeachers();
}

async function restoreTeacher(teacher) {
    const confirmed = confirm(
        "Restore " + teacher.first_name + " " +
        teacher.last_name + "?"
    );

    if (!confirmed) return;

    const { error } = await db
        .from("teachers")
        .update({ archived_at: null })
        .eq("id", teacher.id)
        .eq("school_id", currentSchoolId);

    if (error) {
        showMessage("Unable to restore teacher: " + error.message, true);
        return;
    }

    showMessage("Teacher restored successfully.", false);
    await loadArchivedTeachers();
}

async function toggleArchived() {
    if (!currentSchoolId) return;

    if (showingArchived) {
        await loadTeachers();
    } else {
        showingArchived = true;

        document.getElementById("showArchivedButton").textContent =
            "View Active Teachers";

        await loadArchivedTeachers();
    }
}

function resetForm() {
    document.getElementById("teacherForm").reset();
    document.getElementById("teacherId").value = "";

    document.getElementById("saveTeacherButton").textContent =
        "Register Teacher";

    document.getElementById("cancelEditButton").hidden = true;
}

function showMessage(message, isError) {
    const element = document.getElementById("teacherMessage");
    element.textContent = message;
    element.style.color = isError ? "red" : "green";
}
