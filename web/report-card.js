document.addEventListener("DOMContentLoaded", async () => {

// ==========================================
// 1. SUPABASE CONFIGURATION
// ==========================================

const db = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

const classSelect = document.getElementById("classSelect");
const studentSelect = document.getElementById("studentSelect");
const sessionSelect = document.getElementById("sessionSelect");
const termSelect = document.getElementById("termSelect");
const generateBtn = document.getElementById("generateBtn");
const reportMessage = document.getElementById("reportMessage");
const reportSheet = document.getElementById("reportSheet");
const printBtn = document.getElementById("printBtn");

let schoolId = null;

// ==========================================
// 2. PRINT STYLING
// ==========================================

function installPrintStyles() {

    const style = document.createElement("style");

    style.textContent = `
    @page {
        size: A4 portrait;
        margin: 12mm;
    }

    @media print {

        body * {
            visibility: hidden !important;
        }

        #reportSheet,
        #reportSheet * {
            visibility: visible !important;
        }

        #reportSheet {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            color: black !important;
        }

        #printBtn,
        #reportMessage,
        button,
        select,
        input,
        nav,
        header,
        footer {
            display: none !important;
        }

        table {
            width: 100% !important;
            border-collapse: collapse !important;
        }

        tr {
            page-break-inside: avoid !important;
        }

        th, td {
            border: 1px solid #000 !important;
            color: black !important;
            padding: 6px !important;
        }

        img {
            max-width: 100%;
        }

        #studentPassport {
            max-width: 110px !important;
        }

        #schoolLogo {
            max-width: 95px !important;
        }

        .school-motto,
        .head-teacher-name {
            color: black !important;
        }
    }
    `;

    document.head.appendChild(style);
}

installPrintStyles();

// ==========================================
// 3. GENERAL FUNCTIONS
// ==========================================

function showMessage(message, type = "error") {

    if (!reportMessage) return;

    reportMessage.textContent = message;

    reportMessage.style.color =
        type === "success" ? "green" : "red";
}

function setText(id, value) {

    const element = document.getElementById(id);

    if (element) {
        element.textContent = value ?? "";
    }
}

function getFullName(student) {

    return [
        student.first_name,
        student.middle_name,
        student.last_name
    ].filter(Boolean).join(" ");
}

function getGrade(score) {

    if (score >= 80) return "A - Excellent";
    if (score >= 70) return "B - Very Good";
    if (score >= 60) return "C - Good";
    if (score >= 50) return "D - Credit";
    if (score >= 45) return "E - Pass";

    return "F - Fail";
}

function getPositionSuffix(position) {

    if (position % 100 >= 11 && position % 100 <= 13) {
        return "th";
    }

    switch (position % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
}

function addCell(row, value) {

    const cell = document.createElement("td");

    cell.textContent = value ?? "";

    row.appendChild(cell);
}

// ==========================================
// 4. LOAD SCHOOL BRANDING
// ==========================================

async function loadSchoolBranding() {

    const { data: school, error } = await db
        .from("schools")
        .select(
            "school_name, school_motto, head_teacher_name, school_email, phone, address, logo_url"
        )
        .eq("id", schoolId)
        .single();

    if (error) {

        console.error("School branding error:", error);

        throw new Error("Unable to load school information.");

    }

    // SCHOOL INFORMATION

    setText("schoolName", school.school_name);

    // NEW: SCHOOL MOTTO

    setText(
        "schoolMotto",
        school.school_motto
            ? `"${school.school_motto}"`
            : ""
    );

    // NEW: HEAD TEACHER'S NAME

    setText(
        "headTeacherName",
        school.head_teacher_name
            ? `Head Teacher: ${school.head_teacher_name}`
            : ""
    );

    // CONTACT DETAILS

    setText("schoolAddress", school.address);
    setText("schoolPhone", school.phone);
    setText("schoolEmail", school.school_email);

    // FOOTER

    setText("footerSchoolName", school.school_name);
    setText("footerSchoolAddress", school.address);
    setText("footerSchoolPhone", school.phone);

    // SCHOOL LOGO

    const logo = document.getElementById("schoolLogo");

    if (logo) {

        logo.style.display = "none";
        logo.removeAttribute("src");

        if (school.logo_url) {

            logo.onload = () => {
                logo.style.display = "block";
            };

            logo.onerror = () => {
                console.error("School logo failed to load.");
                logo.style.display = "none";
            };

            logo.src = school.logo_url;

        }

    }

}

// ==========================================
// 5. AUTOMATIC TEACHER COMMENTS
// ==========================================

function getTeacherComment(average, attendanceRate) {

    let comment;

    if (average >= 80) {

        comment =
            "An outstanding performance! The pupil has demonstrated excellent understanding and commitment to learning. Keep up the excellent work.";

    } else if (average >= 70) {

        comment =
            "A very good performance. The pupil demonstrates strong understanding of the subjects. More effort will produce excellent results.";

    } else if (average >= 60) {

        comment =
            "A good performance. The pupil is making encouraging progress. Continued practice and dedication are recommended.";

    } else if (average >= 50) {

        comment =
            "A fair performance. The pupil should improve concentration, participate actively in lessons and devote more time to studies.";

    } else if (average >= 45) {

        comment =
            "The pupil has made some progress but needs greater commitment, regular revision and additional academic support.";

    } else {

        comment =
            "Performance is below expectation. The pupil needs serious improvement, regular supervision and additional academic support.";
    }

    if (attendanceRate < 75) {

        comment +=
            " Attendance needs significant improvement.";

    } else if (attendanceRate >= 95) {

        comment +=
            " Excellent attendance throughout the term.";

    }

    return comment;
}

// ==========================================
// 6. AUTOMATIC HEAD TEACHER COMMENTS
// ==========================================

function getHeadComment(average, position, classSize) {

    if (average >= 80) {

        return "Excellent achievement. Keep striving for greater success. Promoted to the next class, subject to school promotion requirements.";

    }

    if (average >= 70) {

        return "Very good result. Maintain this standard and continue working hard. Promoted to the next class, subject to school promotion requirements.";

    }

    if (average >= 60) {

        return "Good effort. Continue to work hard and aim for higher achievement. Promotion is subject to school requirements.";

    }

    if (average >= 50) {

        return "Satisfactory effort, but improvement is necessary. More attention should be given to weaker subjects.";

    }

    if (average >= 45) {

        return "Performance requires improvement. Parents and guardians are encouraged to provide additional academic support.";

    }

    return "Serious academic improvement is required. Parents and guardians should work closely with the school to support the pupil.";
}

// ==========================================
// 7. INITIALIZE SCHOOL AND USER
// ==========================================

async function initialize() {

    try {

        const { data: authData, error: authError } =
            await db.auth.getUser();

        if (authError || !authData.user) {

            showMessage("Please log in to continue.");

            return;
        }

        const { data: membership, error: membershipError } =
            await db
                .from("school_memberships")
                .select("school_id")
                .eq("user_id", authData.user.id)
                .eq("role", "school_admin")
                .limit(1)
                .maybeSingle();

        if (membershipError) {

            console.error(membershipError);

            showMessage("Unable to verify school membership.");

            return;
        }

        if (!membership) {

            showMessage("School membership could not be found.");

            return;
        }

        schoolId = membership.school_id;

        await loadSchoolBranding();

        await loadClasses();

    } catch (error) {

        console.error(error);

        showMessage("Unable to initialize report card.");

    }
}

// ==========================================
// 8. LOAD CLASSES
// ==========================================

async function loadClasses() {

    classSelect.innerHTML =
        '<option value="">Loading classes...</option>';

    const { data, error } = await db
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", schoolId)
        .order("class_name");

    if (error) {

        console.error(error);

        classSelect.innerHTML =
            '<option value="">Unable to load classes</option>';

        showMessage("Unable to load classes.");

        return;
    }

    classSelect.innerHTML =
        '<option value="">Select Class</option>';

    (data || []).forEach(item => {

        const option = document.createElement("option");

        option.value = item.id;

        option.textContent = item.arm
            ? `${item.class_name} ${item.arm}`
            : item.class_name;

        classSelect.appendChild(option);

    });

}

// ==========================================
// 9. LOAD ENROLLED STUDENTS
// ==========================================

async function loadStudents() {

    studentSelect.innerHTML =
        '<option value="">Select Student</option>';

    reportSheet.style.display = "none";

    if (printBtn) {
        printBtn.style.display = "none";
    }

    const classId = classSelect.value;
    const session = sessionSelect.value;
    const term = termSelect.value;

    if (!classId || !session || !term) return;

    studentSelect.innerHTML =
        '<option value="">Loading students...</option>';

    const { data: enrollments, error: enrollmentError } =
        await db
            .from("student_enrollments")
            .select("student_id")
            .eq("school_id", schoolId)
            .eq("class_id", classId)
            .eq("academic_session", session)
            .eq("term", term);

    if (enrollmentError) {

        console.error(enrollmentError);

        studentSelect.innerHTML =
            '<option value="">Unable to load students</option>';

        return;
    }

    const studentIds = [
        ...new Set(
            (enrollments || []).map(item => item.student_id)
        )
    ];

    if (studentIds.length === 0) {

        studentSelect.innerHTML =
            '<option value="">No students enrolled</option>';

        return;
    }

    const { data: students, error: studentError } = await db
        .from("students")
        .select(
            "id, admission_number, first_name, middle_name, last_name"
        )
        .eq("school_id", schoolId)
        .in("id", studentIds)
        .is("archived_at", null)
        .order("first_name");

    if (studentError) {

        console.error(studentError);

        studentSelect.innerHTML =
            '<option value="">Unable to load students</option>';

        return;
    }

    studentSelect.innerHTML =
        '<option value="">Select Student</option>';

    (students || []).forEach(student => {

        const option = document.createElement("option");

        option.value = student.id;

        option.textContent =
            `${getFullName(student)} (${student.admission_number})`;

        studentSelect.appendChild(option);

    });

}

// ==========================================
// 10. LOAD ATTENDANCE SUMMARY
// ==========================================

async function loadAttendance(
    studentId,
    classId,
    session,
    term
) {

    const { data: attendance, error } = await db
        .from("attendance")
        .select("status")
        .eq("school_id", schoolId)
        .eq("student_id", studentId)
        .eq("class_id", classId)
        .eq("academic_session", session)
        .eq("term", term);

    if (error) {

        console.error("Attendance error:", error);

        throw new Error("Unable to load attendance summary.");

    }

    const records = attendance || [];

    const present = records.filter(
        r => r.status === "Present"
    ).length;

    const absent = records.filter(
        r => r.status === "Absent"
    ).length;

    const late = records.filter(
        r => r.status === "Late"
    ).length;

    const excused = records.filter(
        r => r.status === "Excused"
    ).length;

    const total = records.length;

    const attendanceRate = total > 0
        ? ((present + late) / total * 100)
        : 0;

    setText("attendanceTotal", total);
    setText("attendancePresent", present);
    setText("attendanceAbsent", absent);
    setText("attendanceLate", late);
    setText("attendanceExcused", excused);
    setText("attendanceRate", attendanceRate.toFixed(1) + "%");

    return attendanceRate;
}

// ==========================================
// 11. AUTOMATIC CLASS RANKING
// ==========================================

async function loadClassRanking(
    studentId,
    classId,
    session,
    term
)    {

    const { data: enrollments, error: enrollmentError } =
        await db
            .from("student_enrollments")
            .select("student_id")
            .eq("school_id", schoolId)
            .eq("class_id", classId)
            .eq("academic_session", session)
            .eq("term", term);

    if (enrollmentError) throw enrollmentError;

    const classStudentIds = [
        ...new Set(
            (enrollments || []).map(item => item.student_id)
        )
    ];

    setText("classSize", classStudentIds.length);

    if (classStudentIds.length === 0) {

        setText("classPosition", "No Students");
        setText("classAverage", "0");
        setText("studentAverage", "0");

        return {
            position: null,
            classSize: 0
        };
    }

    const { data: classResults, error: rankingError } =
        await db
            .from("academic_results")
            .select("student_id, total_score")
            .eq("school_id", schoolId)
            .eq("academic_session", session)
            .eq("term", term)
            .in("student_id", classStudentIds);

    if (rankingError) throw rankingError;

    const studentTotals = {};

    (classResults || []).forEach(result => {

        const id = result.student_id;

        if (!studentTotals[id]) {

            studentTotals[id] = {
                total: 0,
                count: 0
            };

        }

        studentTotals[id].total +=
            Number(result.total_score || 0);

        studentTotals[id].count++;

    });

    const rankings = Object.entries(studentTotals)
        .map(([id, data]) => ({
            studentId: id,
            average: data.total / data.count
        }))
        .sort((a, b) => b.average - a.average);

    if (rankings.length === 0) {

        setText("classPosition", "No Results");
        setText("classAverage", "0");
        setText("studentAverage", "0");

        return {
            position: null,
            classSize: classStudentIds.length
        };
    }

    const classAverage =
        rankings.reduce(
            (sum, item) => sum + item.average,
            0
        ) / rankings.length;

    const currentStudent = rankings.find(
        item => item.studentId === studentId
    );

    setText(
        "classAverage",
        classAverage.toFixed(1)
    );

    if (!currentStudent) {

        setText("classPosition", "Not Ranked");
        setText("studentAverage", "No Results");

        return {
            position: null,
            classSize: classStudentIds.length
        };
    }

    const position = rankings.filter(
        item => item.average > currentStudent.average
    ).length + 1;

    setText(
        "classPosition",
        position + getPositionSuffix(position)
    );

    setText(
        "studentAverage",
        currentStudent.average.toFixed(1)
    );

    return {
        position,
        classSize: classStudentIds.length
    };

}

// ==========================================
// 12. GENERATE STUDENT REPORT
// ==========================================

async function generateReport() {

    const classId = classSelect.value;
    const studentId = studentSelect.value;
    const session = sessionSelect.value;
    const term = termSelect.value;

    if (!classId || !studentId || !session || !term) {

        showMessage(
            "Please select class, student, session and term."
        );

        return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = "Generating...";

    reportSheet.style.display = "none";

    if (printBtn) {
        printBtn.style.display = "none";
    }

    try {

        // STUDENT DETAILS

        const { data: student, error: studentError } =
            await db
                .from("students")
                .select("*")
                .eq("id", studentId)
                .eq("school_id", schoolId)
                .single();

        if (studentError) throw studentError;

        // CLASS DETAILS

        const { data: classData, error: classError } =
            await db
                .from("classes")
                .select("class_name, arm")
                .eq("id", classId)
                .eq("school_id", schoolId)
                .single();

        if (classError) throw classError;

        // ACADEMIC RESULTS

        const { data: results, error: resultsError } =
            await db
                .from("academic_results")
                .select(
                    "subject_id, ca_score, exam_score, total_score"
                )
                .eq("school_id", schoolId)
                .eq("student_id", studentId)
                .eq("academic_session", session)
                .eq("term", term);

        if (resultsError) throw resultsError;

        // SUBJECT DETAILS

        const subjectIds = [
            ...new Set(
                (results || []).map(item => item.subject_id)
            )
        ];

        let subjects = [];

        if (subjectIds.length > 0) {

            const { data, error } = await db
                .from("subjects")
                .select("id, subject_name, subject_code")
                .eq("school_id", schoolId)
                .in("id", subjectIds);

            if (error) throw error;

            subjects = data || [];

        }

        const subjectMap = {};

        subjects.forEach(subject => {
            subjectMap[subject.id] = subject;
        });

        // DISPLAY RESULTS

        const table =
            document.getElementById("reportResults");

        table.innerHTML = "";

        let grandTotal = 0;

        (results || []).forEach((result, index) => {

            const subject = subjectMap[result.subject_id];

            if (!subject) return;

            const ca = Number(result.ca_score || 0);
            const exam = Number(result.exam_score || 0);
            const total = Number(result.total_score || 0);

            grandTotal += total;

            const row = document.createElement("tr");

            const gradeParts = getGrade(total).split(" - ");

            addCell(row, table.children.length + 1);
            addCell(row, subject.subject_name);
            addCell(row, ca);
            addCell(row, exam);
            addCell(row, total);
            addCell(row, gradeParts[0]);
            addCell(row, gradeParts[1] || "");

            table.appendChild(row);

        });

        // STUDENT PERFORMANCE

        const subjectCount = table.children.length;

        const average = subjectCount > 0
            ? grandTotal / subjectCount
            : 0;

        setText("studentName", getFullName(student));
        setText("admissionNumber", student.admission_number);

        setText(
            "studentClass",
            classData.arm
                ? `${classData.class_name} ${classData.arm}`
                : classData.class_name
        );

        setText("academicSession", session);
        setText("academicTerm", term);
        setText("reportSession", `${session} - ${term}`);

        setText("totalScore", grandTotal.toFixed(1));
        setText("averageScore", average.toFixed(1));
        setText("subjectCount", subjectCount);

        setText(
            "overallGrade",
            subjectCount > 0
                ? getGrade(average)
                : "No Results"
        );

        // STUDENT PASSPORT - PRIVATE STORAGE SIGNED URL

        const passport = document.getElementById("studentPassport");

        if (passport) {

            passport.onload = null;
            passport.onerror = null;
            passport.removeAttribute("src");
            passport.style.display = "none";

            if (student.passport_url) {

                const { data: photoData, error: photoError } =
                    await db.storage
                        .from("student-passports")
                        .createSignedUrl(student.passport_url, 3600);

                if (photoError) {

                    console.error("Passport retrieval error:", photoError);

                } else if (photoData?.signedUrl) {

                    passport.onload = () => {
                        passport.style.display = "block";
                    };

                    passport.onerror = () => {
                        console.error("Report card passport failed to load.");
                        passport.style.display = "none";
                    };

                    passport.src = photoData.signedUrl;

                }

            }

        }

        // LOAD ATTENDANCE

        const attendanceRate = await loadAttendance(
            studentId,
            classId,
            session,
            term
        );

        // LOAD CLASS RANKING

        const ranking = await loadClassRanking(
            studentId,
            classId,
            session,
            term
        );

        // AUTOMATIC COMMENTS

        setText(
            "teacherComment",
            subjectCount > 0
                ? getTeacherComment(average, attendanceRate)
                : "No academic results recorded for this student."
        );

        setText(
            "headComment",
            subjectCount > 0
                ? getHeadComment(
                    average,
                    ranking.position,
                    ranking.classSize
                )
                : "Academic assessment is required before a final comment can be given."
        );

        // DISPLAY REPORT

        reportSheet.style.display = "block";

        if (printBtn) {
            printBtn.style.display = "inline-block";
        }

        showMessage(
            "Student report card generated successfully.",
            "success"
        );

    } catch (error) {

        console.error("Report generation error:", error);

        showMessage(
            "Unable to generate report card. Please check the selections and try again."
        );

    } finally {

        generateBtn.disabled = false;
        generateBtn.textContent = "Generate Report Card";

    }

}

// ==========================================
// 13. EVENT LISTENERS
// ==========================================

classSelect.addEventListener("change", loadStudents);
sessionSelect.addEventListener("change", loadStudents);
termSelect.addEventListener("change", loadStudents);

generateBtn.addEventListener("click", generateReport);

if (printBtn) {

    printBtn.addEventListener("click", () => {

        if (reportSheet.style.display !== "none") {
            window.print();
        }

    });

}

// ==========================================
// 14. START APPLICATION
// ==========================================

await initialize();

});
