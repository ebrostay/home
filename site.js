const year = document.querySelector("#year");
const inquiryForm = document.querySelector("#inquiryForm");

if (year) {
  year.textContent = new Date().getFullYear();
}

if (inquiryForm) {
  inquiryForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(inquiryForm);
    const name = formData.get("name")?.toString().trim() || "Guest";
    const email = formData.get("email")?.toString().trim() || "";
    const dates = formData.get("dates")?.toString().trim() || "Flexible dates";
    const message = formData.get("message")?.toString().trim() || "I would like to know more about staying at Ebrostay.";

    const subject = encodeURIComponent(`Ebrostay inquiry from ${name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nDates: ${dates}\n\n${message}`
    );

    window.location.href = `mailto:hello@ebrostay.com?subject=${subject}&body=${body}`;
  });
}
