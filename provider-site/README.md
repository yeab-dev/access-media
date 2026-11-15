# Debo Learning: example lesson provider website

A made-up company's website, used as the "before" host for the demo. It is **not connected to the Digital Bridge module**: no `<db-player>`, no module script and no calls to our API. Lesson videos play in the browser's built-in `<video>` player.

It is plain static HTML and CSS, so any web server can serve it:

```
python3 -m http.server 8081 --directory provider-site
# open http://localhost:8081/
```

Pages: home, courses, a course page (`courses/first-job.html`), a lesson page with the video (`lessons/how-to-write-a-cv.html`), jobs and about.

`media/` holds the company's own copy of the 30-second demo lesson (placeholder slides built by `scripts/make-demo.sh`).
