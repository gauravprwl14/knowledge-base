# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - navigation [ref=e5]:
        - link "Voice App" [ref=e6] [cursor=pointer]:
          - /url: /
        - generic [ref=e7]:
          - link "Upload" [ref=e8] [cursor=pointer]:
            - /url: /
          - link "Jobs" [ref=e9] [cursor=pointer]:
            - /url: /jobs
    - main [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]:
            - heading "Jobs" [level=1] [ref=e14]
            - paragraph [ref=e15]: View and manage your transcription jobs
          - generic [ref=e16]:
            - generic [ref=e17]:
              - checkbox "Auto-refresh" [checked] [ref=e18]
              - text: Auto-refresh
            - button "Refresh" [disabled] [ref=e19]:
              - img [ref=e20]
              - text: Refresh
        - generic [ref=e25]:
          - generic [ref=e26]: API Key
          - textbox "Enter your API key to view jobs" [ref=e27]
        - paragraph [ref=e29]: Enter your API key to view jobs
  - alert [ref=e30]
```