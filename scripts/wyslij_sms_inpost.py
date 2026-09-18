"""Wysyla InPostowi prosbe o kod SMS - wolane przez vite.config.ts.

Dlaczego Python, nie Node.js: zywy test 2026-09-18 (patrz pamiec projektu
"kokpit-plan-budowy") wykazal, ze Cloudflare przed InPostem cicho blokuje
to zadanie z Node.js (zwraca 200, ale nigdy nie wysyla SMS-a) - niezaleznie
od proxy, User-Agenta czy adresu IP. To samo zadanie z Pythona (inny stos
TLS/HTTP) przechodzi. Stad to osobny proces, nie zwykly fetch() w Vicie.

Kontrakt z Node.js: JEDNA linia JSON na stdout, zawsze
{"status": <int>, "body": <str>} - Node przekazuje to 1:1 do przegladarki,
bez wlasnych zalozen o tresci. Kod wyjscia zawsze 0 (nawet dla bledow
InPostu) - kod niezerowy oznacza dla Node "Python sam sie wywalil".

Uzycie: python wyslij_sms_inpost.py <numer 9 cyfr>
"""
import json
import re
import sys
import urllib.error
import urllib.request

# Te same naglowki co w vite.config.ts / supabase/functions/inpost-polacz,
# inpost-sync (potwierdzone na zywym koncie 2026-08-15 przez
# ha-parcel-integrations/ha-inpost) - jesli zmieniasz jeden z czterech
# kopii, zmien wszystkie.
NAGLOWKI = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "InPost-Mobile/3.27.2 (Android 14; SDK 34) okhttp/4.11.0",
    "X-Api-Version": "1",
}


def main() -> int:
    if len(sys.argv) != 2 or not re.fullmatch(r"\d{9}", sys.argv[1]):
        print(json.dumps({"status": 400, "body": json.dumps({"blad": "Nieprawidlowy numer telefonu."})}))
        return 0

    req = urllib.request.Request(
        "https://api-inmobile-pl.easypack24.net/v1/sendSMSCode",
        data=json.dumps({"phoneNumber": sys.argv[1]}).encode("utf-8"),
        headers=NAGLOWKI,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as odp:
            print(json.dumps({"status": odp.status, "body": odp.read().decode("utf-8")}))
    except urllib.error.HTTPError as e:
        print(json.dumps({"status": e.code, "body": e.read().decode("utf-8")}))
    except Exception as e:  # noqa: BLE001 - kazdy blad sieci ma trafic do przegladarki, nie do stderr
        print(json.dumps({"status": 502, "body": json.dumps({"blad": f"Python nie polaczyl sie z InPostem: {e}"})}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
