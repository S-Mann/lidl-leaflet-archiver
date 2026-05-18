# Introduction

This simple app lets you search current and previous leaflets for products offered in Aldi and Lidl.
There are two manual steps required, leaflet pdf should be downloaded from each site and should be added to the leaflet folder and the indexer needs to run on these leaflets to generate the products.js

```
python -m venv venv
source venv/bin/activate
pip install -r scripts/requirements.txt
python -m scripts/index-leaflets.py
```

Then you can just check your brower and access the files through `file://` protocol locally.
