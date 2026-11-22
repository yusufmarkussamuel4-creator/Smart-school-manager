const db = supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

let currentSchoolId = null;
let classes = [];
let currentStudents = [];
let currentEnrollments = [];

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
    const element = document.getElementById("transferMessage");
    element.textContent = text;
    element.style.color = error ? "red" : "green";
}

async function initializeRegister() {
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

        document.getElementById("loadRegisterButton")
            .addEventListener("click", loadClassRegister);

        document.getElementById("registerSearch")
            .addEventListener("input", displayRegister);

        document.getElementById("transferForm")
            .addEventListener("submit", transferStudent);

    } catch (error) {
        console.error(error);
        alert("Unable to initialize Class Register: " + error.message);
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

    const classSelect = document.getElementById("registerClass");
    const destinationSelect = document.getElementById("transferClass");

    classSelect.innerHTML = '<option value="">Select Class</option>';
    destinationSelect.innerHTML =
        '<option value="">Select destination class</option>';

    classes.forEach(item => {
        const label = item.class_name +
            (item.arm ? " - " + item.arm : "");

        const option1 = document.createElement("option");
        option1.value = item.id;
        option1.textContent = label;
        classSelect.appendChild(option1);

        const option2 = document.createElement("option");
        option2.value = item.id;
        option2.textContent = label;
        destinationSelect.appendChild(option2);
    });
}

async function loadClassRegister() {
    const classId = document.getElementById("registerClass").value;
    const session = document.getElementById("registerSession").value.trim();
    const term = document.getElementById("registerTerm").value;

    if (!classId || !session || !term) {
        alert("Select a class, academic session and term.");
        return;
    }

    try {
        document.getElementById("registerList").innerHTML =
            '<tr><td colspan="5">Loading students...</td></tr>';

        const { data: enrollments, error: enrollmentError } = await db
            .from("student_enrollments")
            .select("id, student_id, class_id, academic_session, term")
            .eq("school_id", currentSchoolId)
            .eq("class_id", classId)
            .eq("academic_session", session)
            .eq("term", term);

        if (enrollmentError) throw enrollmentError;

        currentEnrollments = enrollments || [];

        if (!currentEnrollments.length) {
            currentStudents = [];
            displayRegister();
            return;
        }

        const studentIds = currentEnrollments.map(item => item.student_id);

        const { data: studentData, error: studentError } = await db
            .from("students")
            .select("id, admission_number, first_name, middle_name, last_name, gender, archived_at")
            .eq("school_id", currentSchoolId)
            .in("id", studentIds)
            .is("archived_at", null);

        if (studentError) throw studentError;

        currentStudents = (studentData || []).map(student => {
            const enrollment = currentEnrollments.find(
                item => item.student_id === student.id
            );

            return {
                ...student,
                enrollment_id: enrollment?.id,
                class_id: enrollment?.class_id
            };
        });

        const selectedClass = classes.find(item => item.id === classId);

        document.getElementById("registerTitle").textContent =
            selectedClass
                ? selectedClass.class_name +
                  (selectedClass.arm ? " - " + selectedClass.arm : "") +
                  " Register"
                : "Students in Class";

        displayRegister();

        loadTransferStudents();

    } catch (error) {
        console.error(error);

        document.getElementById("registerList").innerHTML =
            `<tr><td colspan="5">Error: ${escapeHTML(error.message)}</td></tr>`;
    }
}

function displayRegister() {
    const tbody = document.getElementById("registerList");

    const search = document.getElementById("registerSearch")
        .value.toLowerCase();

    const filtered = currentStudents.filter(student => {
        const name = [
            student.first_name,
            student.middle_name,
            student.last_name
        ].filter(Boolean).join(" ").toLowerCase();

        return name.includes(search) ||
            student.admission_number.toLowerCase().includes(search);
    });

    document.getElementById("registerSummary").textContent =
        `Total Students: ${filtered.length}`;

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">No students found in this class.</td>
            </tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((student, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapeHTML(student.admission_number)}</td>
            <td>${escapeHTML([
                student.first_name,
                student.middle_name,
                student.last_name
            ].filter(Boolean).join(" "))}</td>
            <td>${escapeHTML(student.gender || "-")}</td>
            <td>
                <button onclick="selectStudentForTransfer('${student.id}')">
                    Transfer
                </button>
            </td>
        </tr>
    `).join("");
}

function loadTransferStudents() {
    const select = document.getElementById("transferStudent");

    select.innerHTML = '<option value="">Select Student</option>';

    currentStudents.forEach(student => {
        const option = document.createElement("option");

        option.value = student.id;
        option.textContent =
            student.admission_number + " - " +
            student.first_name + " " + student.last_name;

        select.appendChild(option);
    });
}

function selectStudentForTransfer(studentId) {
    document.getElementById("transferStudent").value = studentId;

    document.getElementById("transferForm")
        .scrollIntoView({ behavior: "smooth" });
}

async function transferStudent(event) {
    event.preventDefault();

    const studentId = document.getElementById("transferStudent").value;
    const destinationClassId = document.getElementById("transferClass").value;

    if (!studentId || !destinationClassId) {
        showMessage("Select a student and destination class.", true);
        return;
    }

    const student = currentStudents.find(
        item => item.id === studentId
    );

    if (!student) {
        showMessage("Student record not found. Reload the class register.", true);
        return;
    }

    if (student.class_id === destinationClassId) {
        showMessage("Student is already in this class.", true);
        return;
    }

    const destination = classes.find(
        item => item.id === destinationClassId
    );

    const confirmed = confirm(
        `Transfer ${student.first_name} ${student.last_name} to ` +
        `${destination.class_name} ${destination.arm || ""}?`
    );

    if (!confirmed) return;

    try {
        const { error } = await db
            .from("student_enrollments")
            .update({
                class_id: destinationClassId
            })
            .eq("id", student.enrollment_id)
            .eq("school_id", currentSchoolId);

        if (error) throw error;

        showMessage("Student transferred successfully.");

        document.getElementById("transferForm").reset();

        await loadClassRegister();

    } catch (error) {
        console.error(error);
        showMessage("Transfer failed: " + error.message, true);
    }
}

initializeRegister();
