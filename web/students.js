// ==========================================
// SMART SCHOOL MANAGER
// STUDENT MANAGEMENT MODULE
// ==========================================

// Initialize Supabase
const db = window.supabase.createClient(
window.SUPABASE_CONFIG.URL,
window.SUPABASE_CONFIG.KEY
);

let currentSchoolId = null;
let registeredStudents = [];

// ==========================================
// INITIALIZE STUDENT MANAGEMENT
// ==========================================

async function initializeStudents() {
const message = document.getElementById("studentMessage");

try {
    // Check authenticated user
    const { data: authData, error: authError } =
        await db.auth.getUser();

    if (authError || !authData.user) {
        window.location.href = "index.html";
        return;
    }

    // Find school administrator membership
    const { data: memberships, error: membershipError } =
        await db
            .from("school_memberships")
            .select("school_id, role")
            .eq("user_id", authData.user.id)
            .eq("role", "school_admin");

    if (membershipError) throw membershipError;

    if (!memberships || memberships.length === 0) {
        throw new Error("No school administrator membership found.");
    }

    currentSchoolId = memberships[0].school_id;

    // Verify school approval
    const { data: school, error: schoolError } = await db
        .from("schools")
        .select("id, approval_status")
        .eq("id", currentSchoolId)
        .single();

    if (schoolError) throw schoolError;

    if (school.approval_status !== "approved") {
        throw new Error("Your school has not been approved.");
    }

    // Load classes and students
    await loadClasses();
    await loadStudents();

} catch (error) {
    console.error("Initialization error:", error);

    message.textContent = error.message;
    message.style.color = "red";
}

}

// ==========================================
// LOAD SCHOOL CLASSES
// ==========================================

async function loadClasses() {
const select = document.getElementById("classId");

const { data, error } = await db
    .from("classes")
    .select("id, class_name, arm")
    .eq("school_id", currentSchoolId)
    .order("class_name");

if (error) throw error;

select.innerHTML = '<option value="">Select Class</option>';

if (!data || data.length === 0) {
    select.innerHTML =
        '<option value="">No classes available</option>';
    return;
}

data.forEach(item => {
    const option = document.createElement("option");

    option.value = item.id;

    option.textContent =
        item.class_name +
        (item.arm ? " - " + item.arm : "");

    select.appendChild(option);
});

}

// ==========================================
// REGISTER NEW STUDENT
// ==========================================

document.getElementById("studentForm").addEventListener(
"submit",
async function(event) {

    event.preventDefault();

    const message = document.getElementById("studentMessage");
    const button = this.querySelector("button[type='submit']");

    if (!currentSchoolId) {
        message.textContent = "School information is not available.";
        message.style.color = "red";
        return;
    }

    button.disabled = true;
    button.textContent = "Registering...";

    try {

        const student = {
            school_id: currentSchoolId,

            admission_number:
                document.getElementById("admissionNumber").value.trim(),

            first_name:
                document.getElementById("firstName").value.trim(),

            middle_name:
                document.getElementById("middleName").value.trim() || null,

            last_name:
                document.getElementById("lastName").value.trim(),

            gender:
                document.getElementById("gender").value || null,

            date_of_birth:
                document.getElementById("dateOfBirth").value || null,

            guardian_name:
                document.getElementById("guardianName").value.trim() || null,

            guardian_phone:
                document.getElementById("guardianPhone").value.trim() || null,

            home_address:
                document.getElementById("homeAddress").value.trim() || null
        };

        const classId =
            document.getElementById("classId").value;

        const academicSession =
            document.getElementById("academicSession").value.trim();

        const term =
            document.getElementById("term").value;

        if (!student.admission_number) {
            throw new Error("Enter an admission number.");
        }

        if (!student.first_name || !student.last_name) {
            throw new Error("Enter the student's first and last names.");
        }

        if (!classId) {
            throw new Error("Select a class.");
        }

        if (!academicSession || !term) {
            throw new Error("Select the academic session and term.");
        }

        // Save student information
        const { data: newStudent, error: studentError } = await db
            .from("students")
            .insert(student)
            .select("id")
            .single();

        if (studentError) throw studentError;

        // Enrol student into selected class
        const { error: enrolmentError } = await db
            .from("student_enrollments")
            .insert({
                school_id: currentSchoolId,
                student_id: newStudent.id,
                class_id: classId,
                academic_session: academicSession,
                term: term
            });

        if (enrolmentError) {
            throw new Error(
                "Student was saved, but class enrolment failed. " +
                "Please contact the administrator. Details: " +
                enrolmentError.message
            );
        }

        message.textContent =
            "Student registered and enrolled successfully!";

        message.style.color = "green";

        // Reset registration form
        this.reset();

        // Refresh student list
        await loadStudents();

    } catch (error) {

        console.error("Registration error:", error);

        message.textContent = error.message;
        message.style.color = "red";

    } finally {

        button.disabled = false;
        button.textContent = "Register Student";
    }
}

);

// ==========================================
// LOAD STUDENTS WITH THEIR ACTUAL CLASSES
// ==========================================

async function loadStudents() {

const list = document.getElementById("studentList");

list.innerHTML =
    '<tr><td colspan="4">Loading students...</td></tr>';

try {

    // Get students belonging to this school
    const { data: students, error: studentError } = await db
        .from("students")
        .select(`
            id,
            admission_number,
            first_name,
            middle_name,
            last_name,
            gender,
            created_at
        `)
        .eq("school_id", currentSchoolId)
        .order("created_at", { ascending: false });

    if (studentError) throw studentError;

    // Get school enrolments
    const { data: enrollments, error: enrolmentError } = await db
        .from("student_enrollments")
        .select(`
            student_id,
            class_id,
            academic_session,
            term,
            created_at
        `)
        .eq("school_id", currentSchoolId)
        .order("created_at", { ascending: false });

    if (enrolmentError) throw enrolmentError;

    // Get school classes
    const { data: classes, error: classError } = await db
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", currentSchoolId);

    if (classError) throw classError;

    // Create class lookup
    const classMap = new Map();

    classes.forEach(item => {

        classMap.set(
            item.id,
            item.class_name +
            (item.arm ? " - " + item.arm : "")
        );

    });

    // Find the latest enrolment for each student
    const enrollmentMap = new Map();

    enrollments.forEach(item => {

        if (!enrollmentMap.has(item.student_id)) {
            enrollmentMap.set(item.student_id, item);
        }

    });

    // Combine student and class information
    registeredStudents = students.map(student => {

        const enrollment =
            enrollmentMap.get(student.id);

        return {
            ...student,

            className: enrollment
                ? classMap.get(enrollment.class_id) || "Class not found"
                : "Not assigned",

            academicSession: enrollment
                ? enrollment.academic_session
                : "-",

            term: enrollment
                ? enrollment.term
                : "-"
        };

    });

    displayStudents(registeredStudents);

} catch (error) {

    console.error("Student loading error:", error);

    list.innerHTML =
        '<tr><td colspan="4">Unable to load students: ' +
        error.message +
        '</td></tr>';

}

}

// ==========================================
// DISPLAY STUDENT RECORDS
// ==========================================

function displayStudents(students) {

const list = document.getElementById("studentList");

list.innerHTML = "";

if (!students || students.length === 0) {

    list.innerHTML =
        '<tr><td colspan="4">No students registered yet.</td></tr>';

    return;
}

students.forEach(student => {

    const row = document.createElement("tr");

    const admission = document.createElement("td");
    admission.textContent = student.admission_number;

    const name = document.createElement("td");

    name.textContent = [
        student.first_name,
        student.middle_name,
        student.last_name
    ].filter(Boolean).join(" ");

    const gender = document.createElement("td");
    gender.textContent = student.gender || "-";

    const classCell = document.createElement("td");
    classCell.textContent = student.className;

    row.append(
        admission,
        name,
        gender,
        classCell
    );

    list.appendChild(row);

});

}

// ==========================================
// SEARCH STUDENTS
// ==========================================

document.getElementById("studentSearch").addEventListener(
"input",
function() {

    const search = this.value.trim().toLowerCase();

    const filteredStudents = registeredStudents.filter(student => {

        const fullName = [
            student.first_name,
            student.middle_name,
            student.last_name
        ].filter(Boolean).join(" ").toLowerCase();

        return (
            fullName.includes(search) ||
            student.admission_number.toLowerCase().includes(search) ||
            student.className.toLowerCase().includes(search)
        );

    });

    displayStudents(filteredStudents);

}

);

// ==========================================
// LOGOUT
// ==========================================

async function logoutStudentManagement() {

await db.auth.signOut();

window.location.href = "index.html";

}

// ==========================================
// START APPLICATION
// ==========================================

initializeStudents();
