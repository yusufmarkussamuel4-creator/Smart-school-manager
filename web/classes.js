const db = supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

let currentSchoolId = null;
let classes = [];
let editingClassId = null;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function showMessage(text, error = false) {
    const box = document.getElementById("classMessage");
    box.textContent = text;
    box.style.color = error ? "red" : "green";
}

async function initializeClasses() {
    try {
        const { data: auth, error: authError } =
            await db.auth.getUser();

        if (authError || !auth.user) {
            alert("Please log in first.");
            window.location.href = "index.html";
            return;
        }

        const { data: membership, error } = await db
            .from("school_memberships")
            .select("school_id")
            .eq("user_id", auth.user.id)
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

        document.getElementById("classForm")
            .addEventListener("submit", saveClass);

        document.getElementById("classSearch")
            .addEventListener("input", displayClasses);

    } catch (error) {
        console.error(error);
        showMessage(error.message, true);
    }
}

async function loadClasses() {
    const { data, error } = await db
        .from("classes")
        .select("id, class_name, arm, created_at")
        .eq("school_id", currentSchoolId)
        .order("class_name");

    if (error) throw error;

    classes = data || [];

    // Count enrolled students per class
    const { data: enrollments, error: enrollmentError } = await db
        .from("student_enrollments")
        .select("class_id, student_id")
        .eq("school_id", currentSchoolId);

    if (enrollmentError) throw enrollmentError;

    const enrollmentList = enrollments || [];

    classes = classes.map(item => ({
        ...item,
        student_count: enrollmentList.filter(
            enrollment => enrollment.class_id === item.id
        ).length
    }));

    displayClasses();
}

function displayClasses() {
    const tbody = document.getElementById("classList");
    const search = document.getElementById("classSearch")
        .value.toLowerCase();

    const filtered = classes.filter(item => {
        const name = `${item.class_name} ${item.arm || ""}`
            .toLowerCase();
        return name.includes(search);
    });

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4">No classes found.</td>
            </tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(item => `
        <tr>
            <td>${escapeHTML(item.class_name)}</td>
            <td>${escapeHTML(item.arm || "-")}</td>
            <td>${item.student_count}</td>
            <td>
                <button onclick="editClass('${item.id}')">Edit</button>
                <button onclick="deleteClass('${item.id}')">Delete</button>
            </td>
        </tr>
    `).join("");
}

async function saveClass(event) {
    event.preventDefault();

    const className = document.getElementById("className")
        .value.trim();

    const arm = document.getElementById("classArm")
        .value.trim() || null;

    if (!className) {
        showMessage("Enter a class name.", true);
        return;
    }

    const payload = {
        school_id: currentSchoolId,
        class_name: className,
        arm: arm
    };

    try {
        if (editingClassId) {
            const { error } = await db
                .from("classes")
                .update({
                    class_name: className,
                    arm: arm
                })
                .eq("id", editingClassId)
                .eq("school_id", currentSchoolId);

            if (error) throw error;

            showMessage("Class updated successfully.");

        } else {
            const duplicate = classes.find(item =>
                item.class_name.toLowerCase() === className.toLowerCase() &&
                (item.arm || "").toLowerCase() === (arm || "").toLowerCase()
            );

            if (duplicate) {
                showMessage("This class and arm already exist.", true);
                return;
            }

            const { error } = await db
                .from("classes")
                .insert(payload);

            if (error) throw error;

            showMessage("Class created successfully.");
        }

        resetForm();
        await loadClasses();

    } catch (error) {
        console.error(error);
        showMessage(error.message, true);
    }
}

function editClass(id) {
    const item = classes.find(c => c.id === id);
    if (!item) return;

    editingClassId = id;

    document.getElementById("classId").value = id;
    document.getElementById("className").value = item.class_name;
    document.getElementById("classArm").value = item.arm || "";

    document.getElementById("saveClassButton").textContent =
        "Update Class";

    document.getElementById("cancelEditButton").style.display =
        "block";

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
    editingClassId = null;

    document.getElementById("classForm").reset();
    document.getElementById("classId").value = "";

    document.getElementById("saveClassButton").textContent =
        "Create Class";

    document.getElementById("cancelEditButton").style.display =
        "none";
}

async function deleteClass(id) {
    const item = classes.find(c => c.id === id);
    if (!item) return;

    if (item.student_count > 0) {
        alert(
            "This class has enrolled students. " +
            "Move the students to another class before deleting it."
        );
        return;
    }

    if (!confirm(
        `Delete ${item.class_name} ${item.arm || ""}?`
    )) return;

    const { error } = await db
        .from("classes")
        .delete()
        .eq("id", id)
        .eq("school_id", currentSchoolId);

    if (error) {
        alert("Unable to delete class: " + error.message);
        return;
    }

    showMessage("Class deleted successfully.");
    await loadClasses();
}

document.getElementById("cancelEditButton")
    .addEventListener("click", resetForm);

initializeClasses();
