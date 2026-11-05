from fastapi import FastAPI

app = FastAPI(title="SiyasatQL")


@app.get("/health")
def health():
    return {"status": "ok"}