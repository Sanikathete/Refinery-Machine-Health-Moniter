# Deployment (Azure VM, Nginx)

This project can be hosted fully on a single Linux VM:
- Frontend (Vite build) served by Nginx from `frontend/dist`
- Backend (Django/DRF) served behind Nginx under `/api/`

## 1) One-time VM prerequisites

### System packages

```bash
sudo apt-get update
sudo apt-get install -y python3-venv nodejs npm nginx
```

If your distro already provides Node via another method, ensure Node 18+ is installed.

### Repo clone

```bash
cd /home/azureuser
git clone https://github.com/<your-org-or-user>/Refinery-Machine-Health-Moniter.git
cd Refinery-Machine-Health-Moniter
```

## 2) Python venv (fixes PEP 668 / externally-managed-environment)

Ubuntu/Debian can block `pip install` globally with:
`error: externally-managed-environment`.

Create a virtual environment once:

```bash
cd /home/azureuser/Refinery-Machine-Health-Moniter
python3 -m venv venv
source venv/bin/activate
python -m pip install -U pip
deactivate
```

## 3) Deploy (pull + backend + frontend)

This repo includes a one-command deploy script:

```bash
cd /home/azureuser/Refinery-Machine-Health-Moniter
bash deploy_vm.sh
```

## 4) Nginx cache safety (important)

If browsers keep loading an old UI after deploy, ensure `index.html` is not cached:

```nginx
location = /index.html {
  add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
}
```

Then reload Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 5) Validate

- Health: `https://<domain>/api/health/`
- Frontend JS bundle is new: view page source and confirm `/assets/index-<hash>.js` changes after deploy.

