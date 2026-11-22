// ==========================================
// SMART SCHOOL MANAGER - STUDENT MANAGEMENT
// ==========================================

const db = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

let currentSchoolId = null;
let registeredStudents = [];
let schoolClasses = [];
let selectedStudent = null;
let editingProfile = false;

// ==========================================
// INITIALIZE
// ==========================================

async function initializeStudents() {
    const message = document.getElementById("studentMessage");

    try {
        const { data: authData, error: authError } =
            await db.auth.getUser();

        if (authError || !authData.user) {
            window.location.href = "index.html";
            return;
        }

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

        const { data: school, error: schoolError } = await db
            .from("schools")
            .select("id, approval_status")
            .eq("id", currentSchoolId)
            .single();

        if (schoolError) throw schoolError;

        if (school.approval_status !== "approved") {
            throw new Error("Your school has not been approved.");
        }

        await loadClasses();
        await loadStudents();

    } catch (error) {
        console.error(error);
        message.textContent = error.message;
        message.style.color = "red";
    }
}

// ==========================================
// LOAD CLASSES
// ==========================================

async function loadClasses() {
    const { data, error } = await db
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", currentSchoolId)
        .order("class_name");

    if (error) throw error;

    schoolClasses = data || [];

    const select = document.getElementById("classId");

    select.innerHTML = '<option value="">Select Class</option>';

    schoolClasses.forEach(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent =
            item.class_name + (item.arm ? " - " + item.arm : "");
        select.appendChild(option);
    });

    const profileSelect = document.getElementById("profileClass");

    profileSelect.innerHTML = '<option value="">Select Class</option>';

    schoolClasses.forEach(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent =
            item.class_name + (item.arm ? " - " + item.arm : "");
        profileSelect.appendChild(option);
    });
}

// ==========================================
// REGISTER STUDENT
// ==========================================

document.getElementById("studentForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const message = document.getElementById("studentMessage");
        const button = this.querySelector("button[type='submit']");

        button.disabled = true;
        button.textContent = "Registering...";

        try {
            const student = {
                school_id: currentSchoolId,
                admission_number: document.getElementById("admissionNumber").value.trim(),
                first_name: document.getElementById("firstName").value.trim(),
                middle_name: document.getElementById("middleName").value.trim() || null,
                last_name: document.getElementById("lastName").value.trim(),
                gender: document.getElementById("gender").value || null,
                date_of_birth: document.getElementById("dateOfBirth").value || null,
                guardian_name: document.getElementById("guardianName").value.trim() || null,
                guardian_phone: document.getElementById("guardianPhone").value.trim() || null,
                home_address: document.getElementById("homeAddress").value.trim() || null
            };

            const classId = document.getElementById("classId").value;
            const session = document.getElementById("academicSession").value.trim();
            const term = document.getElementById("term").value;

            if (!student.admission_number || !student.first_name || !student.last_name) {
                throw new Error("Complete the required student information.");
            }

            if (!classId || !session || !term) {
                throw new Error("Select the class, academic session and term.");
            }

            const { data: newStudent, error: studentError } = await db
                .from("students")
                .insert(student)
                .select("id")
                .single();

            if (studentError) throw studentError;

            const { error: enrollmentError } = await db
                .from("student_enrollments")
                .insert({
                    school_id: currentSchoolId,
                    student_id: newStudent.id,
                    class_id: classId,
                    academic_session: session,
                    term: term
                });

            if (enrollmentError) {
                throw new Error(
                    "Student saved, but enrolment failed: " +
                    enrollmentError.message
                );
            }

            message.textContent = "Student registered successfully!";
            message.style.color = "green";

            this.reset();
            await loadStudents();

        } catch (error) {
            message.textContent = error.message;
            message.style.color = "red";
        } finally {
            button.disabled = false;
            button.textContent = "Register Student";
        }
    }
);

// ==========================================
// LOAD STUDENTS
// ==========================================

async function loadStudents() {
    const list = document.getElementById("studentList");

    list.innerHTML = '<tr><td colspan="5">Loading students...</td></tr>';

    try {
        const { data: students, error: studentError } = await db
            .from("students")
            .select("*")
            .eq("school_id", currentSchoolId)
            .order("created_at", { ascending: false });

        if (studentError) throw studentError;

        const { data: enrollments, error: enrollmentError } = await db
            .from("student_enrollments")
            .select("*")
            .eq("school_id", currentSchoolId)
            .order("created_at", { ascending: false });

        if (enrollmentError) throw enrollmentError;

        const enrollmentMap = new Map();

        enrollments.forEach(item => {
            if (!enrollmentMap.has(item.student_id)) {
                enrollmentMap.set(item.student_id, item);
            }
        });

        const classMap = new Map();

        schoolClasses.forEach(item => {
            classMap.set(
                item.id,
            item.class_name + (item.arm ? " - " + item.arm : "")
            );
        });

        registeredStudents = students.map(student => {
            const enrollment = enrollmentMap.get(student.id);

            return {
                ...student,
                enrollmentId: enrollment ? enrollment.id : null,
                classId: enrollment ? enrollment.class_id : "",
                className: enrollment
                    ? classMap.get(enrollment.class_id) || "Class not found"
                    : "Not assigned",
                academicSession: enrollment ? enrollment.academic_session : "",
                term: enrollment ? enrollment.term : ""
            };
        });

        displayStudents(registeredStudents);

    } catch (error) {
        console.error(error);
        list.innerHTML =
            `<tr><td colspan="5">Unable to load students: ${error.message}</td></tr>`;
    }
}

// ==========================================
// DISPLAY STUDENTS
// ==========================================

function displayStudents(students) {
    const list = document.getElementById("studentList");
    list.innerHTML = "";

    if (!students.length) {
        list.innerHTML =
            '<tr><td colspan="5">No students registered yet.</td></tr>';
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

        const actions = document.createElement("td");

        const viewButton = document.createElement("button");
        viewButton.textContent = "View Profile";
        viewButton.className = "student-btn view-btn";
        viewButton.type = "button";
        viewButton.addEventListener("click", () => openProfile(student.id));

        const editButton = document.createElement("button");
        editButton.textContent = "Edit";
        editButton.className = "student-btn edit-btn";
        editButton.type = "button";
        editButton.addEventListener("click", () => openProfile(student.id, true));

        actions.append(viewButton, editButton);

        row.append(admission, name, gender, classCell, actions);
        list.appendChild(row);
    });
}

// ==========================================
// OPEN STUDENT PROFILE
// ==========================================

function openProfile(studentId, editMode = false) {
    const student = registeredStudents.find(item => item.id === studentId);

    if (!student) return;

    selectedStudent = student;
    editingProfile = false;

    document.getElementById("profileStudentId").value = student.id;
    document.getElementById("profileEnrollmentId").value =
        student.enrollmentId || "";

    document.getElementById("profileAdmission").value = student.admission_number || "";
    document.getElementById("profileFirstName").value = student.first_name || "";
    document.getElementById("profileMiddleName").value = student.middle_name || "";
    document.getElementById("profileLastName").value = student.last_name || "";
    document.getElementById("profileGender").value = student.gender || "";
    document.getElementById("profileDOB").value = student.date_of_birth || "";
    document.getElementById("profileGuardian").value = student.guardian_name || "";
    document.getElementById("profilePhone").value = student.guardian_phone || "";
    document.getElementById("profileClass").value = student.classId || "";
    document.getElementById("profileSession").value = student.academicSession || "";
    document.getElementById("profileTerm").value = student.term || "";
    document.getElementById("profileAddress").value = student.home_address || "";

    document.getElementById("profileMessage").textContent = "";

    document.getElementById("profileModal").style.display = "block";

    setProfileMode(editMode);
}

// ==========================================
// VIEW OR EDIT MODE
// ==========================================

function setProfileMode(editMode) {
    editingProfile = editMode;

    const form = document.getElementById("profileForm");

    form.querySelectorAll("input:not([type='hidden']), select, textarea")
        .forEach(field => {
            field.disabled = !editMode;
        });

    document.getElementById("profileTitle").textContent =
        editMode ? "Edit Student Information" : "Student Profile";

    document.getElementById("editProfileButton").style.display =
        editMode ? "none" : "inline-block";

    document.getElementById("saveProfileButton").style.display =
        editMode ? "inline-block" : "none";

    document.getElementById("cancelEditButton").style.display =
        editMode ? "inline-block" : "none";
}

// ==========================================
// EDIT BUTTON
// ==========================================

document.getElementById("editProfileButton").addEventListener(
    "click",
    function() {
        setProfileMode(true);
    }
);

// ==========================================
// CANCEL EDITING
// ==========================================

document.getElementById("cancelEditButton").addEventListener(
    "click",
    function() {
        if (selectedStudent) {
            openProfile(selectedStudent.id, false);
        }
    }
);

// ==========================================
// SAVE STUDENT CHANGES
// ==========================================

document.getElementById("profileForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        if (!editingProfile || !selectedStudent) return;

        const message = document.getElementById("profileMessage");
        const button = document.getElementById("saveProfileButton");

        button.disabled = true;
        button.textContent = "Saving...";

        try {
            const studentId = document.getElementById("profileStudentId").value;

            const updatedStudent = {
                admission_number: document.getElementById("profileAdmission").value.trim(),
                first_name: document.getElementById("profileFirstName").value.trim(),
                middle_name: document.getElementById("profileMiddleName").value.trim() || null,
                last_name: document.getElementById("profileLastName").value.trim(),
                gender: document.getElementById("profileGender").value || null,
                date_of_birth: document.getElementById("profileDOB").value || null,
                guardian_name: document.getElementById("profileGuardian").value.trim() || null,
                guardian_phone: document.getElementById("profilePhone").value.trim() || null,
                home_address: document.getElementById("profileAddress").value.trim() || null
            };

            if (
                !updatedStudent.admission_number ||
                !updatedStudent.first_name ||
                !updatedStudent.last_name
            ) {
                throw new Error("Admission number, first name and last name are required.");
            }

            const { error: updateError } = await db
                .from("students")
                .update(updatedStudent)
                .eq("id", studentId)
                .eq("school_id", currentSchoolId);

            if (updateError) throw updateError;

            const enrollmentId = document.getElementById("profileEnrollmentId").value;

            const classId = document.getElementById("profileClass").value;
            const session = document.getElementById("profileSession").value.trim();
            const term = document.getElementById("profileTerm").value;

            if (!classId || !session || !term) {
                throw new Error("Select the class, academic session and term.");
            }

            const enrollmentData = {
                school_id: currentSchoolId,
                student_id: studentId,
                class_id: classId,
                academic_session: session,
                term: term
            };

            if (enrollmentId) {
                const { error: enrollmentError } = await db
                    .from("student_enrollments")
                    .update(enrollmentData)
                    .eq("id", enrollmentId)
                    .eq("school_id", currentSchoolId);

                if (enrollmentError) throw enrollmentError;

            } else {
                const { error: enrollmentError } = await db
                    .from("student_enrollments")
                    .insert(enrollmentData);

                if (enrollmentError) throw enrollmentError;
            }

            message.textContent = "Student information updated successfully!";
            message.style.color = "green";

            await loadStudents();

            const updated = registeredStudents.find(item => item.id === studentId);

            if (updated) {
                selectedStudent = updated;
                openProfile(studentId, false);
                document.getElementById("profileMessage").textContent =
                    "Changes saved successfully!";
                document.getElementById("profileMessage").style.color = "green";
            }

        } catch (error) {
            console.error(error);
            message.textContent = error.message;
            message.style.color = "red";
        } finally {
            button.disabled = false;
            button.textContent = "Save Changes";
        }
    }
);

// ==========================================
// CLOSE PROFILE
// ==========================================

function closeProfile() {
    document.getElementById("profileModal").style.display = "none";
    selectedStudent = null;
}

// ==========================================
// SEARCH STUDENTS
// ==========================================

document.getElementById("studentSearch").addEventListener(
    "input",
    function() {
        const search = this.value.trim().toLowerCase();

        const filtered = registeredStudents.filter(student => {
            const name = [
                student.first_name,
                student.middle_name,
                student.last_name
            ].filter(Boolean).join(" ").toLowerCase();

            return (
                name.includes(search) ||
                student.admission_number.toLowerCase().includes(search) ||
                student.className.toLowerCase().includes(search)
            );
        });

        displayStudents(filtered);
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
// START
// ==========================================

initializeStudents();
